import { Router } from "express";
import { get, all, localDay, localHour } from "../db.js";
import { lowStock } from "./inventory.js";

const r = Router();

function range(req) {
  const to = req.query.to ? new Date(req.query.to + "T00:00:00") : new Date();
  to.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setDate(end.getDate() + 1);
  const from = req.query.from ? new Date(req.query.from + "T00:00:00") : new Date(to);
  if (!req.query.from) from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), end: end.toISOString(), fromDate: from, endDate: end };
}

const VALID = "o.status <> 'cancelled'";
const localISO = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

r.get("/summary", async (req, res) => {
  const { from, end, fromDate, endDate } = range(req);
  const days = Math.max(1, Math.round((endDate - fromDate) / 86400000));
  const prevFrom = new Date(fromDate); prevFrom.setDate(prevFrom.getDate() - days);

  const cur = await get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(discount),0) AS discounts,
      COALESCE(AVG(total),0) AS avg_ticket FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<?`, from, end);
  const prev = await get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<?`, prevFrom.toISOString(), from);
  const cost = (await get(`SELECT COALESCE(SUM(oi.qty * p.cost),0) AS c FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id
      WHERE ${VALID} AND o.created_at>=? AND o.created_at<?`, from, end)).c;
  const items = (await get(`SELECT COALESCE(SUM(oi.qty),0) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE ${VALID} AND o.created_at>=? AND o.created_at<?`, from, end)).n;
  const cancelled = (await get("SELECT COUNT(*) AS n FROM orders WHERE status='cancelled' AND created_at>=? AND created_at<?", from, end)).n;
  const unpaid = await get(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS t FROM orders o WHERE ${VALID} AND paid=0 AND created_at>=? AND created_at<?`, from, end);

  const daily = await all(`SELECT ${localDay("o.created_at")} AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue,
      COALESCE(SUM((SELECT SUM(oi.qty*COALESCE(p.cost,0)) FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=o.id)),0) AS cost
      FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY 1 ORDER BY 1`, from, end);
  // Fill missing days
  const byDay = Object.fromEntries(daily.map((d) => [d.day, d]));
  const series = [];
  for (let d = new Date(fromDate); d < endDate; d.setDate(d.getDate() + 1)) {
    const key = localISO(d);
    series.push(byDay[key] || { day: key, orders: 0, revenue: 0, cost: 0 });
  }

  const hourly = await all(`SELECT ${localHour("o.created_at")} AS hour, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
      FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY 1 ORDER BY 1`, from, end);

  const payments = await all(`SELECT COALESCE(payment_method,'unpaid') AS method, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
      FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY 1`, from, end);
  const types = await all(`SELECT type, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY type`, from, end);

  const topProducts = await all(`SELECT oi.name, oi.emoji, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue, SUM(oi.qty*COALESCE(p.cost,0)) AS cost, c.name AS category, c.color AS color
      FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE ${VALID} AND o.created_at>=? AND o.created_at<? GROUP BY oi.name, oi.emoji, c.name, c.color ORDER BY qty DESC LIMIT 10`, from, end);
  const categories = await all(`SELECT COALESCE(c.name,'Sin categoría') AS name, COALESCE(c.color,'#9ca3af') AS color, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue
      FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE ${VALID} AND o.created_at>=? AND o.created_at<? GROUP BY c.id, c.name, c.color ORDER BY revenue DESC`, from, end);

  const avgPrep = (await get(`SELECT AVG(EXTRACT(EPOCH FROM (ready_at::timestamptz - created_at::timestamptz))/60) AS m FROM orders o WHERE ready_at IS NOT NULL AND created_at>=? AND created_at<?`, from, end)).m;

  const pct = (a, b) => (b ? ((a - b) / b) * 100 : a ? 100 : 0);
  res.json({
    range: { from: localISO(fromDate), to: localISO(new Date(endDate - 1)), days },
    kpis: {
      revenue: cur.revenue, revenue_change: pct(cur.revenue, prev.revenue),
      orders: cur.orders, orders_change: pct(cur.orders, prev.orders),
      avg_ticket: cur.avg_ticket, items, cost, profit: cur.revenue - cost,
      margin: cur.revenue ? ((cur.revenue - cost) / cur.revenue) * 100 : 0,
      discounts: cur.discounts, cancelled, unpaid_orders: unpaid.n, unpaid_total: unpaid.t,
      avg_prep_minutes: avgPrep || 0,
    },
    series, hourly, payments, types, topProducts, categories,
    lowStock: await lowStock(),
  });
});

export default r;
