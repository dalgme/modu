import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { reportDocKey } from '@/lib/data/rounds';
import { partKindOf } from '@/lib/files/round-package-shared';
import { TOPIC_MAX, cleanTopic, type TopicJob, type TopicJobList } from '@/lib/files/report-topic-shared';

/**
 * 회차 보고서 "멘토링 주제" 읽기 목록·저장 (2026-11-18) — 멘토링 총괄표 [주요 내용] 칸용.
 * 읽은 결과는 mentoring_logs.report_topic 에, 읽은 파일 경로는 report_topic_doc_path 에 둔다
 * → 보고서가 바뀌면(경로가 달라지면) 다음 총괄표 받기 때 다시 읽는다. 웹으로 쓴 주제(topic)가 있으면 그걸 쓰고 읽지 않는다.
 */
const URL_TTL = 3600;
const BATCH = 60;

async function scopeLogs(programId: string, groupId: string | null) {
  const admin = createAdminClient();
  const cases = await fetchAll<{ id: string }>((f, t) => {
    let q = admin.from('cases').select('id').eq('program_id', programId);
    if (groupId) q = q.eq('support_type_id', groupId);
    return q.range(f, t);
  });
  const caseIds = cases.map((c) => c.id);
  const logs = await fetchAllIn<{ id: string; case_id: string; topic: string | null; report_topic_doc_path: string | null }>(caseIds, (chunk, f, t) =>
    admin.from('mentoring_logs').select('id, case_id, topic, report_topic_doc_path').in('case_id', chunk).not('report_registered_at', 'is', null).range(f, t),
  );
  const docs = await fetchAllIn<{ case_id: string; doc_key: string; doc_name: string; storage_path: string; mime_type: string | null }>(caseIds, (chunk, f, t) =>
    admin.from('documents').select('case_id, doc_key, doc_name, storage_path, mime_type').in('case_id', chunk).like('doc_key', 'mentoring_report:%').range(f, t),
  );
  const docByKey = new Map(docs.map((d) => [d.doc_key, d]));
  return logs.map((l) => ({ log: l, doc: docByKey.get(reportDocKey(l.id)) ?? null }));
}

export async function listTopicJobs(programId: string, groupId: string | null): Promise<TopicJobList> {
  const rows = await scopeLogs(programId, groupId);
  const withFile = rows.filter((r) => r.doc && !r.log.topic?.trim());
  const todo = withFile.filter((r) => r.log.report_topic_doc_path !== r.doc!.storage_path);
  const batch = todo.slice(0, BATCH);
  const jobs: TopicJob[] = [];
  if (batch.length) {
    const { data, error } = await createAdminClient().storage.from('documents').createSignedUrls(batch.map((r) => r.doc!.storage_path), URL_TTL);
    if (error) throw new Error(`파일 주소를 만들지 못했습니다: ${error.message}`);
    batch.forEach((r, i) => {
      const k = partKindOf(r.doc!.doc_name || r.doc!.storage_path, r.doc!.mime_type);
      jobs.push({ logId: r.log.id, path: r.doc!.storage_path, kind: k === 'pdf' || k === 'hwp' ? k : 'other', url: data?.[i]?.signedUrl ?? '' });
    });
  }
  return { jobs, remaining: todo.length - batch.length, total: withFile.length, done: withFile.length - todo.length };
}

/** 읽은 결과 저장 — 이 행사 회차이고, 보고서 파일이 그 사이 바뀌지 않았을 때만 */
export async function saveTopics(programId: string, results: { logId: string; path: string; topic: string | null }[]): Promise<{ saved: number; skipped: number }> {
  const admin = createAdminClient();
  const ids = Array.from(new Set(results.map((r) => r.logId))).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return { saved: 0, skipped: results.length };
  const logs = await fetchAllIn<{ id: string; case_id: string }>(ids, (chunk, f, t) => admin.from('mentoring_logs').select('id, case_id').in('id', chunk).range(f, t));
  const caseIds = Array.from(new Set(logs.map((l) => l.case_id)));
  const cases = await fetchAllIn<{ id: string; program_id: string }>(caseIds, (chunk, f, t) => admin.from('cases').select('id, program_id').in('id', chunk).range(f, t));
  const caseProgram = new Map(cases.map((c) => [c.id, c.program_id]));
  const docs = await fetchAllIn<{ doc_key: string; storage_path: string }>(caseIds, (chunk, f, t) =>
    admin.from('documents').select('doc_key, storage_path').in('case_id', chunk).like('doc_key', 'mentoring_report:%').range(f, t),
  );
  const pathByKey = new Map(docs.map((d) => [d.doc_key, d.storage_path]));
  const logCase = new Map(logs.map((l) => [l.id, l.case_id]));
  let saved = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  for (const r of results) {
    const caseId = logCase.get(r.logId);
    if (!caseId || caseProgram.get(caseId) !== programId || pathByKey.get(reportDocKey(r.logId)) !== r.path) {
      skipped += 1;
      continue;
    }
    const topic = r.topic ? cleanTopic(String(r.topic)).slice(0, TOPIC_MAX) || null : null;
    const { error } = await admin.from('mentoring_logs').update({ report_topic: topic, report_topic_doc_path: r.path, report_topic_at: now }).eq('id', r.logId);
    if (error) {
      console.error('[report-topic] 저장 실패', error.message);
      skipped += 1;
    } else saved += 1;
  }
  return { saved, skipped };
}
