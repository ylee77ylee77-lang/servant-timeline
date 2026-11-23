"use client";

import { useState, type FormEvent } from "react";
import { SERVICE_TYPES, type ServiceType } from "@/lib/services/catalog";

export function AdminTestCheckIn({ accessToken }: { accessToken: string }) {
  const [selectedService, setSelectedService] = useState<ServiceType | "">("");
  const [completedService, setCompletedService] = useState<ServiceType | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || submitting || completedService) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/check-in/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serviceType: selectedService }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.serviceType !== selectedService) {
        throw new Error(result?.error || "測試報到失敗，請稍後再試。");
      }
      setCompletedService(selectedService);
    } catch (err) {
      setError(err instanceof Error ? err.message : "測試報到失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="mb-5 rounded-[24px] border border-[#E6EAF0] bg-white px-5">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-black text-[#6D55A3]">
        管理員測試報到
      </summary>
      <div className="border-t border-[#E6EAF0] py-4">
        <p className="mb-3 text-xs text-[#64645F]">結果僅顯示於本頁，與正式報到紀錄分開。</p>
        {completedService ? (
          <>
            <p role="status" className="mb-3 text-sm font-black text-[#16744C]">
              {completedService}｜測試報到成功
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedService("");
                setCompletedService("");
                setError("");
              }}
              className="min-h-11 rounded-xl border border-[#6D55A3]/25 px-4 text-sm font-bold text-[#6D55A3]"
            >
              重新測試報到
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <fieldset disabled={submitting}>
              <legend className="mb-2 text-sm font-black text-[#1F2937]">確認測試堂次</legend>
              <div className="grid grid-cols-3 gap-2">
                {SERVICE_TYPES.map((serviceType) => (
                  <button
                    key={serviceType}
                    type="button"
                    aria-pressed={selectedService === serviceType}
                    onClick={() => {
                      setSelectedService(serviceType);
                      setError("");
                    }}
                    className={`min-h-11 rounded-xl border px-1 text-sm font-bold ${
                      selectedService === serviceType
                        ? "border-[#6D55A3] bg-[#6D55A3] text-white"
                        : "border-[#6D55A3]/25 bg-white text-[#6D55A3]"
                    }`}
                  >
                    {serviceType}
                  </button>
                ))}
              </div>
            </fieldset>
            {selectedService && (
              <div className="mt-3">
                <p className="mb-2 text-sm text-[#64645F]">請連線至教會 Wi-Fi「slllc」</p>
                {error && <p role="alert" className="mb-2 text-sm font-bold text-[#B42337]">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-11 rounded-xl bg-[#6D55A3] px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {submitting ? "檢查中…" : `測試報到 ${selectedService}`}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </details>
  );
}
