import { emptyResume, type Resume } from '@jobapp/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cleanResume, ResumeEditor } from '@/components/resume-editor';
import { ResumeUploader } from '@/components/resume-uploader';
import { Button, Card, ErrorBox, Row, T } from '@/components/ui';
import { api, type StoredResume } from '@/lib/api';
import { draftStore } from '@/lib/draft-store';
import { useBaseResume, useInvalidateUserData } from '@/lib/session';
import { space, useColors } from '@/theme';

/** Base resume: edit, re-upload, preview/export without a job. */
export default function ResumeTab() {
  const c = useColors();
  const base = useBaseResume();
  const invalidate = useInvalidateUserData();
  const create = useMutation({ mutationFn: () => api.createResume(emptyResume()), onSuccess: () => invalidate() });

  if (base.isPending) return <ActivityIndicator style={{ marginTop: 80 }} />;
  if (base.error) return <ErrorBox error={base.error} onRetry={() => void base.refetch()} />;

  if (!base.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
          <T variant="title">Resume</T>
          <Card style={{ gap: space.md }}>
            <T variant="subheading">Add your resume</T>
            <T color="textSecondary">Upload a PDF or Word file and we’ll turn it into sections you can edit on your phone.</T>
            <ResumeUploader />
            <Button title="Start from scratch" variant="ghost" onPress={() => create.mutate()} loading={create.isPending} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }
  // Keyed so a newer upload or save re-initialises the editor.
  return <BaseResumeEditor key={`${base.data.id}:${base.data.updatedAt}`} stored={base.data} />;
}

function BaseResumeEditor({ stored }: { stored: StoredResume }) {
  const c = useColors();
  const invalidate = useInvalidateUserData();
  const [draft, setDraft] = useState<Resume>(stored.resume);
  const save = useMutation({
    mutationFn: (r: Resume) => api.saveResume(stored.id, cleanResume(r)),
    onSuccess: () => invalidate(),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.resume);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="title">Resume</T>
            <T variant="caption">{dirty ? 'Unsaved changes' : 'Saved'}</T>
          </Row>
          <ResumeEditor value={draft} onChange={setDraft} />
          <Card style={{ gap: space.sm }}>
            <T variant="caption">Replace with a new file. Your current edits will be overwritten.</T>
            <ResumeUploader label="Upload a new version" variant="secondary" />
          </Card>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: space.sm, padding: space.lg, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background }}>
          <Button style={{ flex: 1 }} title="Save" variant="secondary" disabled={!dirty} loading={save.isPending} onPress={() => save.mutate(draft)} />
          <Button
            style={{ flex: 1 }}
            title="Preview PDF"
            onPress={() => {
              draftStore.put('base', cleanResume(draft));
              router.push({ pathname: '/export', params: { resumeId: stored.id, draftKey: 'base' } });
            }}
          />
        </View>
        {save.error ? <T color="danger" style={{ paddingHorizontal: space.lg }}>{(save.error as Error).message}</T> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
