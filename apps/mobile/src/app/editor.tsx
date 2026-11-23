import type { Resume } from '@jobapp/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cleanResume, ResumeEditor } from '@/components/resume-editor';
import { TailorSheet } from '@/components/tailor-sheet';
import { Button, Card, ErrorBox, Row, ScoreBadge, T } from '@/components/ui';
import { api, type StoredResume } from '@/lib/api';
import { draftStore } from '@/lib/draft-store';
import { useBaseResume, useInvalidateUserData } from '@/lib/session';
import { space, useColors } from '@/theme';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Screen 4: On-the-spot resume editor, tailored for one job. */
export default function TailorEditor() {
  const { jobId, focus } = useLocalSearchParams<{ jobId: string; focus?: string }>();
  const base = useBaseResume();
  if (base.error) return <ErrorBox error={base.error} onRetry={() => void base.refetch()} />;
  if (!base.data) return <ActivityIndicator style={{ marginTop: 80 }} />;
  return <TailorEditorBody stored={base.data} jobId={jobId} focus={focus} />;
}

function TailorEditorBody({ stored, jobId, focus }: { stored: StoredResume; jobId: string; focus?: string }) {
  const c = useColors();
  const job = useQuery({ queryKey: ['job', jobId], queryFn: () => api.job(jobId) });
  const invalidate = useInvalidateUserData();
  const draftKey = `job:${jobId}`;
  // Pick up where the user left off for this job (e.g. after visiting the preview).
  const [draft, setDraft] = useState<Resume>(() => draftStore.get(draftKey) ?? stored.resume);
  const [target, setTarget] = useState<{ text: string; label: string } | null>(null);
  const applyRef = useRef<((t: string) => void) | null>(null);

  // Live score for the edited (unsaved) version.
  const debounced = useDebounced(draft, 800);
  const audit = useQuery({
    queryKey: ['audit-draft', jobId, debounced],
    queryFn: () => api.audit(jobId, { resume: cleanResume(debounced) }),
    placeholderData: (prev) => prev,
  });

  const saveBase = useMutation({
    mutationFn: () => api.saveResume(stored.id, cleanResume(draft)),
    onSuccess: () => invalidate(),
  });

  const changedFromBase = JSON.stringify(cleanResume(draft)) !== JSON.stringify(cleanResume(stored.resume));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: job.data ? `For ${job.data.companyName}` : 'Tailor resume' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card>
            <Row gap={space.md}>
              {audit.data ? <ScoreBadge score={audit.data.score} /> : <ActivityIndicator />}
              <View style={{ flex: 1 }}>
                <T variant="subheading" numberOfLines={1}>{job.data?.title ?? ' '}</T>
                <T variant="caption">
                  {audit.data
                    ? audit.data.missingSkills.length
                      ? `Missing: ${audit.data.missingSkills.slice(0, 4).join(', ')}`
                      : 'All key skills covered'
                    : 'Checking match…'}
                </T>
              </View>
            </Row>
          </Card>

          <ResumeEditor
            value={draft}
            onChange={(r) => {
              setDraft(r);
              draftStore.put(draftKey, r);
            }}
            tailor={{
              focus,
              missingSkills: audit.data?.missingSkills ?? [],
              tailor: (text, label, apply) => {
                applyRef.current = apply;
                setTarget({ text, label });
              },
            }}
          />

          {changedFromBase ? (
            <Button
              title={saveBase.isSuccess ? '✓ Saved to base resume' : 'Also save changes to my base resume'}
              variant="ghost"
              small
              loading={saveBase.isPending}
              disabled={saveBase.isSuccess}
              onPress={() => saveBase.mutate()}
            />
          ) : null}
        </ScrollView>

        <View style={{ padding: space.lg, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background }}>
          <Button
            title="Preview & export PDF"
            onPress={() => {
              draftStore.put(draftKey, cleanResume(draft));
              router.push({ pathname: '/export', params: { resumeId: stored.id, jobId, draftKey } });
            }}
          />
        </View>
      </KeyboardAvoidingView>

      <TailorSheet
        target={target}
        resumeId={stored.id}
        jobId={jobId}
        onClose={() => setTarget(null)}
        onAccept={(text) => {
          applyRef.current?.(text);
          setTarget(null);
        }}
      />
    </SafeAreaView>
  );
}
