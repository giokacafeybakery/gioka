export type Role = "admin" | "cajero" | "cocina" | "inventario";
export interface User { id: number; name: string; email: string; role: Role; active?: boolean; created_at?: string }

export interface Category { id: number; name: string; emoji: string; color: string; sort: number }

export interface RecipeLine { ingredient_id: number; qty: number; name?: string; unit?: string }
/** One choice inside an option group; `price` is the extra added to the product price (0 = included). */
export interface OptionChoice { name: string; price: number }
/** Sabores / adicionales: `single` = pick one (flavor, size), `multi` = pick any (toppings). */
export interface OptionGroup { name: string; type: "single" | "multi"; required: boolean; choices: OptionChoice[] }
/** A choice the cashier picked for an order line. */
export interface SelectedOption { group: string; name: string; price: number }
export interface Product {
  id: number; category_id: number | null; name: string; description: string; price: number; cost: number;
  emoji: string; image: string | null; active: boolean; track_stock: boolean; stock: number; min_stock: number; sort: number;
  category_name?: string; category_emoji?: string; category_color?: string; recipe: RecipeLine[]; options: OptionGroup[];
}

export interface Ingredient { id: number; name: string; image: string | null; unit: string; stock: number; min_stock: number; cost: number; supplier: string; used_in?: number }

export type OrderType = "takeaway" | "delivery" | "dinein";
export type OrderStatus = "pending" | "preparing" | "ready" | "delivered" | "cancelled" | "refunded";
export type PaymentMethod = "cash" | "card" | "qr";

/** `price` is the unit price already including the extras of `options`. */
export interface OrderItem { id?: number; product_id: number | null; name: string; emoji: string; price: number; qty: number; notes: string; options?: SelectedOption[] }
export interface Order {
  id: number; code: string; daily_number: number; type: OrderType; customer_name: string; customer_phone: string; table_no: string;
  customer_address: string; customer_reference: string;
  status: OrderStatus; payment_method: PaymentMethod | null; paid: boolean; subtotal: number; discount: number; tax: number; total: number;
  cash_received: number | null; notes: string; user_id: number; user_name?: string; created_at: string; updated_at: string;
  paid_at: string | null; ready_at: string | null; delivered_at: string | null; items: OrderItem[];
  refund_method: string | null; refund_amount: number | null; refunded_at: string | null; refund_reason?: string | null;
}
export interface PublicOrder {
  code: string; daily_number: number; status: OrderStatus; type: OrderType; customer_name: string; created_at: string;
  ready_at: string | null; delivered_at: string | null; total: number; paid: boolean; items: { name: string; qty: number; emoji: string; options?: string[] }[];
}

export interface Settings {
  business_name: string; business_tagline: string; business_address: string; business_phone: string; currency: string; tax_rate: number;
  receipt_footer: string; printer_mode: "browser" | "network"; printer_host: string; printer_port: number; printer_width: number;
  auto_print: boolean; order_prefix: string; public_url: string;
  telegram_bot_token: string; telegram_chat_id: string;
  receipt_show_logo?: boolean; receipt_show_customer?: boolean; receipt_show_notes?: boolean; receipt_show_tracking?: boolean;
  receipt_social?: string; receipt_wifi?: string;
  /* Extended receipt customization */
  receipt_show_tagline?: boolean;
  receipt_show_address?: boolean;
  receipt_show_phone?: boolean;
  receipt_show_payment?: boolean;
  receipt_show_change?: boolean;
  receipt_show_items_price?: boolean;
  receipt_show_subtotal?: boolean;
  receipt_show_tax?: boolean;
  receipt_show_order_type?: boolean;
  receipt_show_date?: boolean;
  receipt_show_order_number?: boolean;
  receipt_separator_style?: "dashed" | "solid" | "dotted" | "double";
  receipt_font_size?: "small" | "normal" | "large";
  receipt_header_text?: string;
  receipt_show_emoji?: boolean;
}

export interface CashSession {
  id: number; user_id: number; user_name?: string; opening_amount: number; closing_amount: number | null; expected_amount: number | null;
  notes: string; opened_at: string; closed_at: string | null; totals: { cash: number; card: number; qr: number; orders: number; revenue: number };
  cancelled: number; expected_cash: number;
}

export interface LowStock { products: (Product & { unit: string })[]; ingredients: Ingredient[] }

export interface ReportSummary {
  range: { from: string; to: string; days: number };
  kpis: {
    revenue: number; revenue_change: number; orders: number; orders_change: number; avg_ticket: number; items: number; cost: number;
    profit: number; margin: number; discounts: number; cancelled: number; unpaid_orders: number; unpaid_total: number; avg_prep_minutes: number;
    refunds: number; refunded_total: number;
  };
  series: { day: string; orders: number; revenue: number; cost: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
  payments: { method: string; orders: number; revenue: number }[];
  types: { type: OrderType; orders: number; revenue: number }[];
  topProducts: { name: string; emoji: string; qty: number; revenue: number; cost: number; category: string; color: string }[];
  categories: { name: string; color: string; qty: number; revenue: number }[];
  lowStock: LowStock;
}
