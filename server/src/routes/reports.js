import { Router } from "express";
import { get, all } from "../db.js";
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

r.get("/summary", (req, res) => {
  const { from, end, fromDate, endDate } = range(req);
  const days = Math.max(1, Math.round((endDate - fromDate) / 86400000));
  const prevFrom = new Date(fromDate); prevFrom.setDate(prevFrom.getDate() - days);

  const cur = get(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue, COALESCE(SUM(discount),0) discounts,
      COALESCE(AVG(total),0) avg_ticket FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<?`, from, end);
  const prev = get(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<?`, prevFrom.toISOString(), from);
  const cost = get(`SELECT COALESCE(SUM(oi.qty * p.cost),0) c FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id
      WHERE ${VALID} AND o.created_at>=? AND o.created_at<?`, from, end).c;
  const items = get(`SELECT COALESCE(SUM(oi.qty),0) n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE ${VALID} AND o.created_at>=? AND o.created_at<?`, from, end).n;
  const cancelled = get("SELECT COUNT(*) n FROM orders WHERE status='cancelled' AND created_at>=? AND created_at<?", from, end).n;
  const unpaid = get(`SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM orders o WHERE ${VALID} AND paid=0 AND created_at>=? AND created_at<?`, from, end);

  const daily = all(`SELECT date(created_at,'localtime') day, COUNT(*) orders, COALESCE(SUM(total),0) revenue,
      COALESCE(SUM((SELECT SUM(oi.qty*COALESCE(p.cost,0)) FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=o.id)),0) cost
      FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY day ORDER BY day`, from, end);
  // Fill missing days
  const byDay = Object.fromEntries(daily.map((d) => [d.day, d]));
  const series = [];
  for (let d = new Date(fromDate); d < endDate; d.setDate(d.getDate() + 1)) {
    const key = localISO(d);
    series.push(byDay[key] || { day: key, orders: 0, revenue: 0, cost: 0 });
  }

  const hourly = all(`SELECT CAST(strftime('%H', datetime(created_at,'localtime')) AS INTEGER) hour, COUNT(*) orders, COALESCE(SUM(total),0) revenue
      FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY hour ORDER BY hour`, from, end);

  const payments = all(`SELECT COALESCE(payment_method,'unpaid') method, COUNT(*) orders, COALESCE(SUM(total),0) revenue
      FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY method`, from, end);
  const types = all(`SELECT type, COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders o WHERE ${VALID} AND created_at>=? AND created_at<? GROUP BY type`, from, end);

  const topProducts = all(`SELECT oi.name, oi.emoji, SUM(oi.qty) qty, SUM(oi.qty*oi.price) revenue, SUM(oi.qty*COALESCE(p.cost,0)) cost, c.name category, c.color color
      FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE ${VALID} AND o.created_at>=? AND o.created_at<? GROUP BY oi.name ORDER BY qty DESC LIMIT 10`, from, end);
  const categories = all(`SELECT COALESCE(c.name,'Sin categoría') name, COALESCE(c.color,'#9ca3af') color, SUM(oi.qty) qty, SUM(oi.qty*oi.price) revenue
      FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE ${VALID} AND o.created_at>=? AND o.created_at<? GROUP BY c.id ORDER BY revenue DESC`, from, end);

  const avgPrep = get(`SELECT AVG((julianday(ready_at)-julianday(created_at))*24*60) m FROM orders o WHERE ready_at IS NOT NULL AND created_at>=? AND created_at<?`, from, end).m;

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
    lowStock: lowStock(),
  });
});

export default r;
