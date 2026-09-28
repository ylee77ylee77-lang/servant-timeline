import "server-only";

import { inferStationRole, STATION_OPTIONS_BY_SERVICE, type ServiceType } from "@/lib/services/catalog";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  getServiceActivationState,
  SERVICE_RUNTIME_CONFIG,
  type ServiceActivationState,
} from "@/lib/services/service-activation";

type ServiceRow = {
  id: string;
  service_date: string;
  service_type: string;
  starts_at: string;
  report_at: string | null;
  location: string | null;
  status: string;
};

export type EnsuredCurrentServices = ServiceActivationState & {
  services: ServiceRow[];
};

function toServiceTimestamp(dateKey: string, time: string) {
  return `${dateKey}T${time}:00+08:00`;
}

export async function ensureCurrentServices(now = new Date()): Promise<EnsuredCurrentServices> {
  const activation = getServiceActivationState(now);
  const supabase = getSupabaseAdminClient();

  if (activation.provisionServiceTypes.length === 0) {
    return { ...activation, services: [] };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("worship_services")
    .select("id,service_date,service_type,starts_at,report_at,location,status")
    .eq("service_date", activation.dateKey)
    .in("service_type", activation.provisionServiceTypes);
  if (existingError) throw existingError;

  const existingTypes = new Set(
    (existingRows ?? []).map((row) => String(row.service_type))
  );
  const missingTypes = activation.provisionServiceTypes.filter(
    (serviceType) => !existingTypes.has(serviceType)
  );

  for (const serviceType of missingTypes) {
    const config = SERVICE_RUNTIME_CONFIG[serviceType];
    const { error: insertError } = await supabase
      .from("worship_services")
      .upsert(
        {
          service_date: activation.dateKey,
          service_type: serviceType,
          starts_at: toServiceTimestamp(activation.dateKey, config.startsAt),
          report_at: toServiceTimestamp(activation.dateKey, config.reportTime),
          location: config.location,
          status: "published",
          notes: "系統依固定堂次自動建立。",
          created_by: null,
          updated_by: null,
        },
        {
          onConflict: "service_date,service_type",
          ignoreDuplicates: true,
        }
      );
    if (insertError) throw insertError;
  }

  const { data: services, error: serviceError } = await supabase
    .from("worship_services")
    .select("id,service_date,service_type,starts_at,report_at,location,status")
    .eq("service_date", activation.dateKey)
    .in("service_type", activation.provisionServiceTypes)
    .order("starts_at", { ascending: true });
  if (serviceError) throw serviceError;

  for (const service of services ?? []) {
    const serviceType = String(service.service_type) as ServiceType;
    if (!activation.provisionServiceTypes.includes(serviceType)) continue;

    const stations = STATION_OPTIONS_BY_SERVICE[serviceType].map((name, index) => ({
      service_id: service.id,
      name,
      role_label: inferStationRole(name),
      sort_order: index,
      is_active: true,
    }));

    const { error: stationError } = await supabase
      .from("service_stations")
      .upsert(stations, {
        onConflict: "service_id,name",
        ignoreDuplicates: true,
      });
    if (stationError) throw stationError;
  }

  return {
    ...activation,
    services: (services ?? []) as ServiceRow[],
  };
}
