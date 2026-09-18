/**
 * Offline-related fields the server now returns (and the projection layer adds locally):
 *  - client_id: idempotency key of the operation that created the row (UUID chosen on the device)
 *  - offline:   the row was created while the device had no connection
 *  - pending:   local only — the change is still in the outbox, not yet confirmed by the server
 */
export {};

declare module "@/lib/types" {
  interface Order { client_id?: string | null; offline?: boolean; pending?: boolean }
  interface Ingredient { client_id?: string | null; pending?: boolean }
  interface CashSession { client_id?: string | null; offline?: boolean; pending?: boolean }
}

declare module "@/app/store" {
  interface Movement { client_id?: string | null; offline?: boolean; pending?: boolean }
}
