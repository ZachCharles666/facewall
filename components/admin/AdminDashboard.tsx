"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type School = {
  id: string;
  code: string;
  name: string;
  emailDomains: string[];
  status: string;
};

type Invite = {
  id: string;
  schoolId: string;
  schoolCode: string;
  label: string;
  maxUses: number;
  usedCount: number;
  sessionLimitPerUser: number;
  status: "active" | "disabled";
  expiresAt: string | null;
};

type DeletionRequest = {
  id: string;
  status: string;
  requestedAt: string;
  failureCode: string | null;
};

type Metrics = {
  users: { registered: number; active: number };
  sessions: {
    started: number;
    completed: number;
    completionRate: number;
    dependencyFailures: number;
    fallback: number;
  };
  feedback: { count: number; averageRating: number };
  quota: { granted: number; used: number; remaining: number };
  usage: { inputTokens: number; outputTokens: number };
  deletions: { pending: number };
  apiLatency: {
    scope: string;
    count: number;
    errors: number;
    p50Ms: number;
    p95Ms: number;
  };
};

interface CommonResponse<T> {
  ok: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  requestId: string;
}

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = (await response.json()) as CommonResponse<T>;
  if (!response.ok || !body.ok || body.data === null) {
    throw new Error(
      `${body.error?.message ?? "管理接口失败"} · requestId ${body.requestId}`
    );
  }
  return body.data;
}

function isoDateInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function AdminDashboard() {
  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(
    isoDateInput(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
  );
  const [to, setTo] = useState(isoDateInput(now));
  const [schoolId, setSchoolId] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [deletions, setDeletions] = useState<DeletionRequest[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [shownInvites, setShownInvites] = useState<string[]>([]);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setState("loading");
    setMessage("");
    try {
      const query = new URLSearchParams({
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString()
      });
      if (schoolId) query.set("schoolId", schoolId);
      const [nextMetrics, nextSchools, nextInvites, nextDeletions] =
        await Promise.all([
          api<Metrics>(`/api/admin/metrics?${query}`),
          api<School[]>("/api/admin/schools"),
          api<Invite[]>("/api/admin/invite-codes"),
          api<DeletionRequest[]>("/api/admin/deletion-requests")
        ]);
      setMetrics(nextMetrics);
      setSchools(nextSchools);
      setInvites(nextInvites);
      setDeletions(nextDeletions);
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "运营数据加载失败");
    }
  }, [from, to, schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api<School>("/api/admin/schools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: data.get("code"),
          name: data.get("name"),
          emailDomains: String(data.get("domains") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        })
      });
      form.reset();
      await load(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "学校创建失败");
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const created = await api<
        Invite & {
          inviteCode: string;
          inviteCodes?: Array<Invite & { inviteCode: string }>;
        }
      >(
        "/api/admin/invite-codes",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schoolId: data.get("schoolId"),
            label: data.get("label"),
            maxUses: Number(data.get("maxUses")),
            sessionLimitPerUser: Number(data.get("sessionLimitPerUser")),
            batchCount: Number(data.get("batchCount"))
          })
        }
      );
      setShownInvites(
        created.inviteCodes?.map((item) => item.inviteCode) ?? [
          created.inviteCode
        ]
      );
      form.reset();
      await load(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "邀请码创建失败");
    }
  }

  async function toggleInvite(invite: Invite) {
    try {
      await api<{ id: string }>("/api/admin/invite-codes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: invite.id,
          status: invite.status === "active" ? "disabled" : "active"
        })
      });
      await load(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "邀请码更新失败");
    }
  }

  async function advanceDeletion(item: DeletionRequest) {
    const action =
      item.status === "requested" || item.status === "failed" ? "approve" : "execute";
    if (
      action === "execute" &&
      !window.confirm("确认执行不可恢复的数据删除？系统将保留去标识审计摘要。")
    ) {
      return;
    }
    try {
      await api<DeletionRequest>(
        `/api/admin/deletion-requests/${encodeURIComponent(item.id)}/${action}`,
        { method: "POST" }
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除请求处理失败");
    }
  }

  const cards = metrics
    ? [
        ["注册 / 激活", `${metrics.users.registered} / ${metrics.users.active}`],
        ["开始 / 完成", `${metrics.sessions.started} / ${metrics.sessions.completed}`],
        ["闭环完成率", `${(metrics.sessions.completionRate * 100).toFixed(1)}%`],
        ["依赖最终失败", String(metrics.sessions.dependencyFailures)],
        ["Fallback 会话", String(metrics.sessions.fallback)],
        ["反馈 / 均分", `${metrics.feedback.count} / ${metrics.feedback.averageRating}`],
        ["额度 剩余 / 总量", `${metrics.quota.remaining} / ${metrics.quota.granted}`],
        ["Token 输入 / 输出", `${metrics.usage.inputTokens} / ${metrics.usage.outputTokens}`],
        ["API P50 / P95", `${metrics.apiLatency.p50Ms} / ${metrics.apiLatency.p95Ms} ms`],
        ["待处理删除", String(metrics.deletions.pending)]
      ]
    : [];

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">PASSBUDDY · INTERNAL BETA</p>
          <h1>运营与可观测性</h1>
          <p>只展示聚合指标和技术 ID；不展示简历、JD、答案或报告正文。</p>
        </div>
        <a href="/">返回产品</a>
      </header>

      <section className="admin-filter" aria-label="指标筛选">
        <label>开始<input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>结束<input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>学校<select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          <option value="">全部学校</option>
          {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
        </select></label>
        <button type="button" onClick={() => void load()}>刷新</button>
      </section>

      {state === "loading" && <p className="admin-state">正在加载聚合数据…</p>}
      {state === "error" && <div className="admin-state admin-state-error"><p>{message}</p><button onClick={() => void load()}>重试</button></div>}
      {message && state !== "error" && <p className="admin-state admin-state-error">{message}</p>}

      {state === "ready" && (
        <>
          <section className="admin-metric-grid">
            {cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
          </section>

          <section className="admin-grid">
            <article className="admin-panel">
              <h2>学校</h2>
              <form onSubmit={createSchool} className="admin-form">
                <label>学校代码<input name="code" required placeholder="school-code" /></label>
                <label>学校名称<input name="name" required placeholder="学校名称" /></label>
                <label>邮箱域名<input name="domains" placeholder="域名，逗号分隔" /></label>
                <button type="submit">创建学校</button>
              </form>
              <ul>{schools.map((school) => <li key={school.id}><b>{school.name}</b><span>{school.code} · {school.status}</span></li>)}</ul>
            </article>

            <article className="admin-panel">
              <h2>邀请码</h2>
              {shownInvites.length > 0 && (
                <div className="admin-once">
                  <b>本批邀请码仅显示一次（{shownInvites.length} 条）</b>
                  <div className="admin-code-list">
                    {shownInvites.map((inviteCode, index) => (
                      <div className="admin-code-row" key={inviteCode}>
                        <span>第 {index + 1} 条</span>
                        <code>{inviteCode}</code>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShownInvites([])}>已安全保存</button>
                </div>
              )}
              <form onSubmit={createInvite} className="admin-form">
                <label>学校<select name="schoolId" required defaultValue=""><option value="" disabled>选择学校</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
                <label>用途标签<input name="label" required placeholder="用途标签" /></label>
                <label>批量生成数量<input name="batchCount" type="number" min="1" max="100" defaultValue="1" required /></label>
                <label>每个邀请码最多可兑换次数<input name="maxUses" type="number" min="1" max="1000" defaultValue="1" required /></label>
                <label>每位兑换用户的 Session 额度<input name="sessionLimitPerUser" type="number" min="1" max="100" defaultValue="3" required /></label>
                <small>默认生成 1 条，每条可兑换 1 次，每位兑换用户可开始 3 次训练；批量创建会一次性显示本批全部明文。</small>
                <button type="submit">创建邀请码</button>
              </form>
              <ul>{invites.map((invite) => <li key={invite.id}><div><b>{invite.label}</b><span>{invite.schoolCode} · {invite.usedCount}/{invite.maxUses} · 每人 {invite.sessionLimitPerUser} 次</span></div><button onClick={() => void toggleInvite(invite)}>{invite.status === "active" ? "停用" : "启用"}</button></li>)}</ul>
            </article>

            <article className="admin-panel">
              <h2>删除请求</h2>
              {deletions.length === 0 ? <p>当前没有删除请求。</p> : <ul>{deletions.map((item) => <li key={item.id}><div><b>{item.status}</b><span>{item.id} · {new Date(item.requestedAt).toLocaleString()}</span>{item.failureCode && <span>失败码：{item.failureCode}</span>}</div>{["requested", "failed", "approved"].includes(item.status) && <button onClick={() => void advanceDeletion(item)}>{item.status === "approved" ? "执行删除" : "审批"}</button>}</li>)}</ul>}
            </article>
          </section>
        </>
      )}
    </main>
  );
}
