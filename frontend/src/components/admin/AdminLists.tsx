"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Input, Spinner, useDebounced, useUi } from "@/components/ui/kit";
import { admin, errorMessage, type AdminPayment, type AdminUser } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { dateOnly } from "./adminUi";

const PAGE = 25;

function Pager({ offset, total, onChange }: { offset: number; total: number; onChange: (o: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[12.5px] text-white/50">
      <span>{total === 0 ? "0" : `${offset + 1}–${Math.min(offset + PAGE, total)}`} of {total.toLocaleString()}</span>
      <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE))}>Previous</Button><Button size="sm" variant="ghost" disabled={offset + PAGE >= total} onClick={() => onChange(offset + PAGE)}>Next</Button></div>
    </div>
  );
}

export function AdminPayments({ onOpen }: { onOpen: (workspaceId: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; items: AdminPayment[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { admin.payments({ limit: PAGE, offset }).then(setData).catch((e) => setErr(errorMessage(e, "Couldn't load payments."))); }, [offset]);

  if (err) return <Alert>{err}</Alert>;
  if (!data) return <Spinner />;
  if (data.total === 0) return <EmptyState title="No payments yet" body="Paid orders from Razorpay appear here with their GST invoice numbers." />;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead className="text-[11.5px] uppercase tracking-wide text-white/35"><tr><th className="px-5 py-2.5 font-medium">Paid</th><th className="px-3 py-2.5 font-medium">Workspace</th><th className="px-3 py-2.5 font-medium">Plan</th><th className="px-3 py-2.5 text-right font-medium">Subtotal</th><th className="px-3 py-2.5 text-right font-medium">GST</th><th className="px-3 py-2.5 text-right font-medium">Total</th><th className="px-3 py-2.5 font-medium">Method</th><th className="px-5 py-2.5 font-medium">Invoice</th></tr></thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                <td className="px-5 py-3 text-white/60">{dateOnly(p.paid_at)}</td>
                <td className="px-3 py-3"><button className="font-medium text-white hover:underline" onClick={() => onOpen(p.workspace_id)}>{p.workspace}</button></td>
                <td className="px-3 py-3 capitalize text-white/70">{p.plan_id} · {p.months}m</td>
                <td className="px-3 py-3 text-right text-white/60">{fmtMoney(p.base_amount)}</td>
                <td className="px-3 py-3 text-right text-white/60">{fmtMoney(p.gst_amount)}</td>
                <td className="px-3 py-3 text-right font-medium text-white">{fmtMoney(p.total_amount)}</td>
                <td className="px-3 py-3 text-white/50">{p.method ?? "—"}</td>
                <td className="px-5 py-3 font-mono text-[12px] text-white/50">{p.invoice_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager offset={offset} total={data.total} onChange={setOffset} />
    </Card>
  );
}

export function AdminUsers() {
  const { toast, confirm } = useUi();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; items: AdminUser[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const search = useDebounced(q, 300);

  const load = useCallback(
    () => admin.users({ q: search, limit: PAGE, offset }).then((r) => { setData(r); setErr(null); }).catch((e) => setErr(errorMessage(e, "Couldn't load users."))),
    [search, offset],
  );
  useEffect(() => { void load(); }, [load]);

  const toggle = async (u: AdminUser) => {
    if (u.is_active && !(await confirm({ title: `Deactivate ${u.email}?`, body: "They can no longer sign in. Their workspace and data are kept.", confirmLabel: "Deactivate", danger: true }))) return;
    try { await admin.updateUser(u.id, !u.is_active); toast(u.is_active ? "User deactivated" : "User reactivated"); await load(); } catch (e) { toast(errorMessage(e), "error"); }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-md"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" /><Input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search by email or name…" className="pl-9" /></div>
      {err && <Alert>{err}</Alert>}
      {!data ? <Spinner /> : data.items.length === 0 ? <EmptyState title="No users match" /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-[11.5px] uppercase tracking-wide text-white/35"><tr><th className="px-5 py-2.5 font-medium">User</th><th className="px-3 py-2.5 font-medium">Workspaces</th><th className="px-3 py-2.5 font-medium">Last login</th><th className="px-3 py-2.5 font-medium">Joined</th><th className="px-5 py-2.5" /></tr></thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-5 py-3"><span className="font-medium text-white">{u.full_name || u.email}</span>{!u.is_active && <Badge tone="red" className="ml-2">Deactivated</Badge>}{u.full_name && <span className="block text-[11.5px] text-white/40">{u.email}</span>}</td>
                    <td className="px-3 py-3 text-white/60">{u.workspaces.map((w) => `${w.name} (${w.role})`).join(", ") || "—"}</td>
                    <td className="px-3 py-3 text-white/50">{dateOnly(u.last_login_at)}</td>
                    <td className="px-3 py-3 text-white/50">{dateOnly(u.created_at)}</td>
                    <td className="px-5 py-3 text-right"><Button size="sm" variant={u.is_active ? "ghost" : "soft"} onClick={() => void toggle(u)}>{u.is_active ? "Deactivate" : "Reactivate"}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager offset={offset} total={data.total} onChange={setOffset} />
        </Card>
      )}
    </div>
  );
}
