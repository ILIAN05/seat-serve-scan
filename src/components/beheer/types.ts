import type { Tables } from "@/integrations/supabase/types";

export type Dish = Tables<"dishes">;
export type Cat = Tables<"categories">;
export type AdminOrder = Tables<"orders"> & { order_items: Tables<"order_items">[] };
export type AdminRequest = Tables<"table_requests">;
