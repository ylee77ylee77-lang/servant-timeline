"""Developer-only 3D avatar source prototype; VTK + NumPy + Pillow.

Not an approved production asset family. Original v2 portraits are untouched.
Produces 512px transparent renders with a locked camera, head, pose and lighting.
"""
from pathlib import Path
import argparse
import math
import json
import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy, numpy_to_vtk
from PIL import Image, ImageDraw, ImageFont

SIZE=512
STYLES={'male':('short','side','wave'), 'female':('bob','long','bun')}
SKIN=(.94,.72,.58)
BROWN=(.26,.15,.095)
BLACK=(.095,.077,.070)


def actor(poly, color, rough=.45, colors=None):
    normals=vtk.vtkPolyDataNormals(); normals.SetInputData(poly); normals.SplittingOff(); normals.ConsistencyOn(); normals.AutoOrientNormalsOn(); normals.Update()
    mapper=vtk.vtkPolyDataMapper(); mapper.SetInputConnection(normals.GetOutputPort())
    if colors is not None:
        a=numpy_to_vtk(np.asarray(colors,dtype=np.uint8),deep=True); a.SetName('rgb'); poly.GetPointData().SetScalars(a); poly.Modified(); mapper.SetColorModeToDirectScalars(); mapper.ScalarVisibilityOn()
    else: mapper.ScalarVisibilityOff()
    a=vtk.vtkActor(); a.SetMapper(mapper); p=a.GetProperty(); p.SetColor(*color); p.SetInterpolationToPhong(); p.SetAmbient(.38); p.SetDiffuse(.72); p.SetSpecular(.19); p.SetSpecularPower(29 if rough<.5 else 12)
    return a


def surface(rows, color, closed=False, vertex_colors=None):
    arr=np.asarray(rows,dtype=float); n,m,_=arr.shape; pts=vtk.vtkPoints(); pts.SetData(numpy_to_vtk(arr.reshape((-1,3)),deep=True))
    faces=vtk.vtkCellArray()
    for i in range(n-1):
        for j in range(m if closed else m-1):
            k=(j+1)%m; q=vtk.vtkQuad()
            for a,b in enumerate((i*m+j,i*m+k,(i+1)*m+k,(i+1)*m+j)): q.GetPointIds().SetId(a,b)
            faces.InsertNextCell(q)
    p=vtk.vtkPolyData(); p.SetPoints(pts); p.SetPolys(faces)
    return actor(p,color,colors=None if vertex_colors is None else np.asarray(vertex_colors).reshape(-1,3))


def ell(center, radii, color, rot=0, rough=.45):
    s=vtk.vtkSphereSource(); s.SetThetaResolution(64); s.SetPhiResolution(48); s.Update(); a=actor(s.GetOutput(),color,rough); a.SetScale(*(2*np.array(radii))); a.SetPosition(*center); a.RotateY(rot); return a


def strand(points, widths, depths, color, facets=20, n=36, grooves=0):
    # Smooth tapered 3D sculpted lock, circular/elliptical cross-section.
    # Catmull-Rom curve with stable front-facing cross-section.
    p=np.asarray(points,float); r=np.asarray(widths,float); d=np.asarray(depths,float)
    rows=[]; colors=[]
    for t in np.linspace(0,len(p)-1,n):
        i=min(int(t),len(p)-2); u=t-i; a=p[max(0,i-1)]; b=p[i]; c=p[i+1]; e=p[min(len(p)-1,i+2)]
        xyz=.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-e)*u*u+(-a+3*b-3*c+e)*u*u*u)
        tangent=.5*((-a+c)+2*(2*a-5*b+4*c-e)*u+3*(-a+3*b-3*c+e)*u*u)
        tangent/=max(np.linalg.norm(tangent),1e-9); normal=np.array([0.,-1.,0.]); normal-=tangent*np.dot(normal,tangent)
        if np.linalg.norm(normal)<.01: normal=np.array([0.,0.,1.]); normal-=tangent*np.dot(normal,tangent)
        normal/=np.linalg.norm(normal); side=np.cross(tangent,normal)
        w=r[i]*(1-u)+r[i+1]*u; h=d[i]*(1-u)+d[i+1]*u
        row=[]; rgb=[]
        for ang in np.linspace(0,2*math.pi,facets,endpoint=False):
            ripple=1+(.045*math.sin(ang*grooves+.2*math.sin(t*4)) if grooves else 0)
            row.append(xyz+ripple*(side*w*math.cos(ang)+normal*h*math.sin(ang)))
            v=1+.065*math.cos(ang*grooves+.2*math.sin(t*4)) if grooves else 1
            rgb.append(np.clip(np.array(color)*255*v,0,255))
        rows.append(row); colors.append(rgb)
    return surface(rows,color,True,colors if grooves else None)


def face_y(x,z):
    zn=(z-1.76)/.94; f=max(0,1-zn*zn); jaw=1-.24*max(0,-zn)**1.25
    rem=f-(x/(.80*jaw))**2
    y=-.61*math.sqrt(max(rem,0))
    if rem>0:
        y-=.125*math.exp(-((x/.115)**2+((z-1.61)/.14)**2))
        y-=.055*math.exp(-((x/.13)**2+((z-1.78)/.28)**2))
        y-=.035*math.exp(-(((abs(x)-.43)/.22)**2+((z-1.56)/.24)**2))
    return y


def head(skin=SKIN):
    # Keep geometry and lighting locked; only the skin material can change.
    skin_rgb=np.asarray(skin,dtype=float)
    blush_rgb=np.asarray([.94,.40,.36])*(skin_rgb/np.asarray(SKIN))
    rows=[]; colors=[]
    for t in np.linspace(.002,math.pi-.002,92):
        z=1.76+.94*math.cos(t); zn=math.cos(t); jaw=1-.24*max(0,-zn)**1.25
        row=[]; rgb=[]
        for ang in np.linspace(0,2*math.pi,144,endpoint=False):
            x=.80*math.sin(t)*math.cos(ang)*jaw; y=.61*math.sin(t)*math.sin(ang)
            if y<0: y=face_y(x,z)
            row.append((x,y,z))
            blush=math.exp(-(((abs(x)-.43)/.21)**2+((z-1.55)/.13)**2))*max(0,-math.sin(ang))*.19
            rgb.append(np.clip((skin_rgb*(1-blush)+blush_rgb*blush)*255,0,255))
        rows.append(row); colors.append(rgb)
    return surface(rows,skin,True,colors)


def eye_white(cx, z):
    rows=[]; edge=[]
    cy=face_y(cx,z)-.025
    # Sculpted almond; its perimeter meets the continuous face.
    for rr in np.linspace(.001,1,30):
        row=[]
        for t in np.linspace(0,2*math.pi,80,endpoint=False):
            x=cx+ .222*rr*math.cos(t); zz=z+ .136*rr*math.sin(t)*(.82+.18*abs(math.sin(t)))+.025*(x-cx)*np.sign(cx)
            y=face_y(x,zz)-.007-.099*math.sqrt(max(0,1-rr*rr)); row.append((x,y,zz))
        rows.append(row)
    return surface(rows,(.98,.96,.93),True),cy


def face_body(gender, skin=SKIN, *, skin_actors=None):
    """Optional material ownership output; eyes, brows, lips and clothes stay separate."""
    a=[]; female=gender=='female'; cloth=(.80,.72,.61) if female else (.30,.30,.32)
    def add_skin(part):
        a.append(part)
        if skin_actors is not None: skin_actors.append(part)
    ear_color=tuple(np.clip(np.asarray([.78,.48,.38])*(np.asarray(skin)/np.asarray(SKIN)),0,1))
    a.append(ell((0,.06,.11),(1.08,.54,.70),cloth,rough=.8))
    add_skin(ell((0,.04,.49),(.30,.30,.45),skin))
    add_skin(head(skin))
    for s in (-1,1):
        add_skin(ell((s*.765,-.015,1.64),(.14,.13,.205),skin,rot=s*-10))
        add_skin(ell((s*.800,-.12,1.64),(.075,.038,.125),ear_color,rot=s*-10))
        cx=s*.290; z=1.81
        white,_=eye_white(cx,z); a.append(white)
        ey=face_y(cx,z)-.094
        a.append(ell((cx,ey-.018,z),(.096,.037,.104),(.29,.14,.063),rough=.29))
        a.append(ell((cx,ey-.045,z),(.052,.017,.061),(.055,.035,.025),rough=.2))
        a.append(ell((cx-.035,ey-.063,z+.039),(.021,.009,.025),(.99,.97,.92),rough=.2))
        a.append(ell((cx+.029,ey-.060,z-.025),(.011,.009,.012),(.83,.88,.92)))
        # Upper eyelid and brow follow the same face surface (no floating pieces).
        lid=[]; brow=[]
        for t in np.linspace(0,math.pi,12):
            x=cx+.220*math.cos(t); zz=z+.132*math.sin(t)+.024*(x-cx)*s
            lid.append((x,face_y(x,zz)-.019,zz))
        a.append(strand(lid,[.005]+[.017 if female else .014]*10+[.003],[.005]+[.012]*10+[.003],(.25,.10,.075),facets=12,n=48))
        for t in np.linspace(0,1,7):
            x=cx-.215+.43*t; zz=2.035+.059*math.sin(math.pi*t)+s*.012*(x-cx)
            brow.append((x,face_y(x,zz)-.025,zz))
        a.append(strand(brow,[.009,.026,.034,.032,.025,.014,.003],[.012]*7,(.235,.12,.074),facets=16))
    # Subtle sculpted smile. Lip boundaries and teeth share the head surface.
    rows=[]; teeth=[]; lip=[]
    for x in np.linspace(-.310,.310,65):
        t=x/.310; upper=1.320+.108*t*t; lower=upper-.115*max(0,1-t*t)**.75
        rows.append([(x,face_y(x,zz)-.015,zz) for zz in np.linspace(lower,upper,12)])
        zz=upper-.056*max(0,1-t*t)**.7
        teeth.append([(x,face_y(x,v)-.020,v) for v in np.linspace(zz,upper-.006,5)])
        lip.append((x,face_y(x,lower)-.017,lower))
    a.append(surface(rows,(.24,.067,.065))); a.append(surface(teeth,(.96,.91,.83)))
    a.append(strand(lip[::8],[.004]+[.016]*7+[.004],[.008]*9,(.78,.36,.29),facets=12))
    # Collar is a curved volume, not a flat glyph.
    collar=[]
    for t in np.linspace(0,2*math.pi,28,endpoint=False): collar.append((.40*math.cos(t),.30*math.sin(t),.53+.075*math.cos(t)**2))
    collar.append(collar[0]); a.append(strand(collar,[.077]*len(collar),[.065]*len(collar),(.70,.62,.51) if female else (.22,.22,.24),n=90,facets=20))
    return a


def hair_cap(style,color):
    female=style in ('bob','long','bun'); rows=[]; colors=[]
    for t in np.linspace(.002,1,55):
        row=[]; rgb=[]
        for ang in np.linspace(0,2*math.pi,128,endpoint=False):
            front=max(0,-math.sin(ang)); rear=max(0,math.sin(ang)); side=math.cos(ang)**2
            theta=(1.12 if female else 1.06)+.54*side+.40*rear + (.055*math.cos(ang)*front if style != "short" else 0)
            if style=='short': theta=1.02+.44*side+.23*rear
            if style=='bun': theta=1.13+.28*side+.18*rear
            t2=t*theta; ripple=1+.020*math.sin(ang*27+5*t2)+.012*math.cos(ang*9-4*t2)
            rz={"short":1.00,"side":1.10,"wave":1.16}.get(style,1.09)
            x=.84*math.sin(t2)*math.cos(ang)*ripple; y=.67*math.sin(t2)*math.sin(ang)*ripple; z=1.76+rz*math.cos(t2)*ripple
            if style in ('side','wave'):
                crown=math.sin(t2)*math.exp(-((t2-.59)/.65)**2)*front
                z+=crown*(.07 if style=='side' else .14)*(1+.60*math.cos(ang+.7))
                y-=.04*crown
                x+=.05*crown
            row.append((x,y,z)); rgb.append(np.clip(np.array(color)*255*(1+.095*math.cos(ang*27+5*t2)),0,255))
        rows.append(row); colors.append(rgb)
    return surface(rows,color,True,colors)


def hairstyles(style,color):
    back=[]; front=[hair_cap(style,color)]
    def lock(seq,w,d,where=front):
        where.append(strand(seq,w,d,color,facets=28,n=40,grooves=9))
    if style=='short':
        pass  # the short style is the sculpted cap itself, not a second frontal overlay
    elif style in ('side','wave'):
        for i in range(7):
            t=i/6; x=.43+.035*i; end=-.64+.057*i
            if style=='side':
                seq=[(x,-.40,2.35+.05*i),(x-.15,-.65,2.57+.035*i),(-.12-.035*i,-.64,2.63+.025*i),(end,-.52,2.38+.049*i)]
                w=[.004,.075,.095,.006]; d=[.004,.068,.08,.006]
            else:
                seq=[(x,-.25,2.55+.018*i),(x-.12,-.54,2.76+.016*i),(-.19-.025*i,-.70,2.74-.022*i),(end-.03,-.66,2.48-.015*i),(end+.018,-.55,2.32+.055*t)]
                w=[.004,.088,.104,.085,.005]; d=[.004,.082,.09,.06,.005]
            lock(seq,w,d)
        for s in [-1,1]: lock([(s*.64,-.1,2.43),(s*.81,-.32,2.22),(s*.75,-.36,1.88)],[.08,.09,.005],[.08,.08,.005])
    else:
        if style=='bun':
            back.append(ell((.06,.26,2.74),(.38,.34,.36),color))
            for i in range(5):
                t=i/4; lock([(-.24+.12*i,.15,2.70),(-.26+.12*i,-.02,2.95),(-.12+.1*i,.27,3.04),(.04+.1*i,.51,2.75)],[.035,.102,.090,.015],[.02,.10,.10,.02],back)
        for s in (-1,1):
            # Back tresses are separate volumes, behind the face and clothing.
            if style!='bun':
                end=.45 if style=='long' else .98
                for i in range(3):
                    x=s*(.55+.12*i)
                    lock([(x,.20,2.30),(s*(.79+.07*i),.20,1.85),(s*(.78+.09*i),.15,1.44),(s*(.68+.10*i),.08,end+.26),(s*(.69+.07*i),.0,end)], [.11,.19,.18,.17,.035],[.1,.15,.15,.12,.028],back)
            # Side-parted front lock, with a single common face and exact eye line.
            for i in range(3):
                x=s*(.45+.09*i); start=.09 if s<0 else .19
                if style=='bun':
                    seq=[(start,-.48,2.69),(s*.43,-.69,2.58),(s*.75,-.48,2.19),(s*.72,-.30,1.92)]
                    w=[.07,.14,.13,.012]; d=[.055,.095,.105,.01]
                else:
                    end=.40+.09*i if style=='long' else 1.04+.04*i
                    seq=[(start,-.48,2.71),(s*.40,-.69,2.61),(s*(.68+.045*i),-.62,2.28),(s*(.80+.06*i),-.41,1.86),(s*(.69+.085*i),-.49,1.48),(s*(.75+.10*i),-.50,end+.24),(s*(.60+.11*i),-.46,end)]
                    w=[.012,.11,.13,.135,.14,.12,.004]; d=[.012,.08,.10,.11,.11,.085,.004]
                lock(seq,w,d)
    return back,front


def glasses(style, color=(.15,.12,.105)):
    if style=='none': return []
    a=[]; col=color
    for s in (-1,1):
        cx=s*.290; pts=[]
        for t in np.linspace(0,2*math.pi,44):
            power={"round":1.0,"classic":.73,"square":.48}[style]
            x=cx+.258*np.sign(math.cos(t))*abs(math.cos(t))**power
            z=1.80+.206*np.sign(math.sin(t))*abs(math.sin(t))**power
            pts.append((x,-.765,z))
        a.append(strand(pts,[.027]*len(pts),[.025]*len(pts),col,facets=14,n=88))
        a.append(strand([(s*.548,-.76,1.85),(s*.61,-.43,1.85),(s*.80,-.10,1.80)],[.025,.025,.015],[.022,.02,.014],col,facets=12))
    a.append(strand([(-.047,-.77,1.83),(0,-.785,1.87),(.047,-.77,1.83)],[.023]*3,[.02]*3,col,n=16,facets=12))
    return a


def render_raw(actors, size=SIZE):
    """Render one 3D object group on the same locked, transparent artboard.

    Fixed clipping planes are essential: depth buffers from different groups
    must be directly comparable. Binary sampling avoids background halos.
    """
    ren=vtk.vtkRenderer(); ren.SetBackground(0,0,0); ren.SetBackgroundAlpha(0.0); ren.AutomaticLightCreationOff()
    for a in actors: ren.AddActor(a)
    for loc,color,intensity in [((-3,-5,6),(1,.94,.88),.83),((3,-3,3),(.91,.95,1),.43),((1,3,5),(1,.93,.84),.60),((0,-5,1.2),(1,.96,.93),.24)]:
        l=vtk.vtkLight(); l.SetLightTypeToSceneLight(); l.SetPosition(*loc); l.SetFocalPoint(0,0,1.7); l.SetColor(*color); l.SetIntensity(intensity); ren.AddLight(l)
    cam=ren.GetActiveCamera(); cam.SetPosition(0,-9,1.54); cam.SetFocalPoint(0,0,1.54); cam.SetViewUp(0,0,1); cam.ParallelProjectionOn(); cam.SetParallelScale(1.79); cam.SetClippingRange(4,14)
    rw=vtk.vtkRenderWindow(); rw.SetOffScreenRendering(1); rw.SetAlphaBitPlanes(1); rw.SetMultiSamples(0); rw.AddRenderer(ren); rw.SetSize(size,size); rw.Render()
    filt=vtk.vtkWindowToImageFilter(); filt.SetInput(rw); filt.SetInputBufferTypeToRGBA(); filt.ReadFrontBufferOff(); filt.Update()
    arr=vtk_to_numpy(filt.GetOutput().GetPointData().GetScalars()).reshape(size,size,4)[::-1].copy()
    df=vtk.vtkWindowToImageFilter(); df.SetInput(rw); df.SetInputBufferTypeToZBuffer(); df.ReadFrontBufferOff(); df.Update()
    depth=vtk_to_numpy(df.GetOutput().GetPointData().GetScalars()).reshape(size,size)[::-1].copy()
    depth[arr[:,:,3]==0]=np.inf
    assert np.all((arr[:,:,3]==0)|(arr[:,:,3]==255)), 'opaque geometry with binary sampling expected'
    rw.Finalize(); return arr, depth


def export_rgba(array, path, size=SIZE):
    im=Image.fromarray(array,'RGBA')
    if im.size!=(size,size): im=im.resize((size,size),Image.Resampling.LANCZOS)
    im.save(path, 'WEBP', lossless=True, method=4)
    return im


def masked_rgba(array, mask):
    out=array.copy(); out[~mask]=0; return out


def composite(layers):
    out=np.zeros_like(layers[0]);
    for layer in layers: out[layer[:,:,3]>0]=layer[layer[:,:,3]>0]
    return out


def reference_z(groups):
    colors=np.stack([a for a,d in groups]); depths=np.stack([d for a,d in groups]); idx=np.argmin(depths,axis=0)
    rows,cols=np.indices(idx.shape); out=colors[idx,rows,cols]; out[~np.isfinite(depths.min(axis=0))]=0; return out


def split_hair(hair, face, glasses_groups):
    """Derive reusable front and rear hair from actual 3D depth, never paint a new face.

    A pixel in front of the face must remain in front. In the outer silhouette,
    place it ahead of eyewear when the hair is physically in front of any of
    the frames. The exact comparison below rejects inconsistent occlusion.
    """
    ha,hd=hair; fa,fd=face; visible=ha[:,:,3]>0; over_face=hd<fd
    front=visible & (fa[:,:,3]>0) & over_face
    for ga,gd in glasses_groups:
        front |= visible & (fa[:,:,3]==0) & (ga[:,:,3]>0) & (hd<gd)
    return masked_rgba(ha,visible & ~front),masked_rgba(ha,front)

def tile(im,size=224):
    canvas=Image.new('RGBA',(512,512)); d=ImageDraw.Draw(canvas); d.ellipse((12,12,500,500),fill='#E8DDF4')
    canvas.alpha_composite(im); clip=Image.new('L',(512,512)); ImageDraw.Draw(clip).ellipse((12,12,500,500),fill=255)
    from PIL import ImageChops
    canvas.putalpha(ImageChops.multiply(canvas.getchannel('A'),clip)); ImageDraw.Draw(canvas).ellipse((12,12,500,500),outline='white',width=14)
    return canvas.resize((size,size),Image.Resampling.LANCZOS)


def main():
    p=argparse.ArgumentParser(); p.add_argument('--output',type=Path,default=Path('.avatar-rig-proof')); p.add_argument('--size',type=int,default=SIZE); args=p.parse_args(); assert args.size==SIZE; out=args.output; out.mkdir(parents=True,exist_ok=True)
    # Supersample once at 2x resolution and resample all transparent layer files.
    sample=SIZE*2; names=[]; rows=[]; asset_count=0; proof=[]
    for gender,styles in STYLES.items():
        family=out/gender; family.mkdir(exist_ok=True); body=face_body(gender); face=render_raw(body,sample); export_rgba(face[0],family/'face-body.webp'); asset_count+=1
        eye_groups={}; eye_layers={}; empty=np.zeros_like(face[0]); no_depth=np.full_like(face[1],np.inf)
        eye_groups['none']=(empty,no_depth); eye_layers['none']=empty
        for style in ('classic','round','square'):
            group=render_raw(glasses(style),sample); eye_groups[style]=group; ga,gd=group
            eye_layers[style]=masked_rgba(ga,(ga[:,:,3]>0)&(gd<face[1])); export_rgba(eye_layers[style],family/f'glasses-{style}.webp'); asset_count+=1
        for hair_style in styles:
            for tone,color in [('brown',BROWN),('dark',BLACK)]:
                back,front=hairstyles(hair_style,color); hair=render_raw(back+front,sample)
                rear,fr=split_hair(hair,face,list(eye_groups.values()))
                export_rgba(rear,family/f'{hair_style}-{tone}-rear.webp'); export_rgba(fr,family/f'{hair_style}-{tone}-front.webp'); asset_count+=2
                for eye in ('none','classic','round','square'):
                    combined=composite([rear,face[0],eye_layers[eye],fr]); ref=reference_z([hair,face,eye_groups[eye]])
                    differ=np.any(combined!=ref,axis=2); occupied=(ref[:,:,3]>0)|(combined[:,:,3]>0)
                    fraction=float(np.sum(differ)/max(1,np.sum(occupied))); names.append(f'{gender}/{hair_style}/{tone}/{eye}')
                    proof.append({'combination':names[-1],'geometry_mismatch_pct':round(100*fraction,5)})
                    if tone=='brown' and eye=='none':
                        name=f'{gender}-{hair_style}'; im=export_rgba(combined,out/f'{name}.webp'); rows.append((name,im))
                    if tone=='dark' and eye=='round':
                        name=f'{gender}-{hair_style}-dark-round'; im=export_rgba(combined,out/f'{name}.webp'); rows.append((name,im))
    # Side-by-side same-head comparison of all six hair shapes and sample eyewear.
    sheet=Image.new('RGB',(3*250+28,4*262+24),'#F9F6FA'); d=ImageDraw.Draw(sheet)
    try: font=ImageFont.truetype('DejaVuSans.ttf',13)
    except OSError: font=ImageFont.load_default()
    for idx,(name,im) in enumerate(rows):
        gender_index=0 if name.startswith('male-') else 1; hair_index=STYLES['male' if gender_index==0 else 'female'].index(name.split('-')[1]); rr=gender_index*2+(1 if name.endswith('dark-round') else 0)
        x=14+250*hair_index;y=12+262*rr; thumb=tile(im); sheet.paste(thumb,(x+13,y),thumb); d.text((x+13,y+231),name,font=font,fill='#4F4559')
    sheet.save(out/'contact-sheet.jpg',quality=94)
    max_mismatch=max(x['geometry_mismatch_pct'] for x in proof); report={'scope':'unapproved 3D source prototype, not runtime art','canvas':SIZE,'source_sampling':sample,'combinations':len(proof),'layer_files':asset_count,'camera_locked':True,'face_geometry_reused':True,'max_geometry_mismatch_pct':max_mismatch,'geometry_gate_pct':0.10,'geometry_gate_passed':max_mismatch<=.10,'visual_gate':'not approved: prototype style differs from current v2 portraits','cases':proof}
    (out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='cases'},indent=2))

if __name__=='__main__': main()
