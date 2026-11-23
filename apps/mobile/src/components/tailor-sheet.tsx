import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { api, type TailorResult } from '@/lib/api';
import { radius, space, useColors } from '@/theme';
import { Badge, Button, Field, Row, T } from './ui';

/**
 * Before/after approval for one bullet (or the summary). The suggestion is editable, and nothing
 * changes until the user taps "Use this version".
 */
export function TailorSheet({
  target,
  resumeId,
  jobId,
  onClose,
  onAccept,
}: {
  target: { text: string; label: string } | null;
  resumeId: string;
  jobId: string;
  onClose: () => void;
  onAccept: (text: string) => void;
}) {
  const c = useColors();
  const tailored = useQuery({
    queryKey: ['tailor', resumeId, jobId, target?.text],
    enabled: !!target,
    queryFn: () => api.tailor(resumeId, jobId, target!.text),
    gcTime: 0,
  });

  return (
    <Modal visible={!!target} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading">Tailor to this job</T>
          <Badge label={tailored.data?.mode === 'llm' ? 'AI' : 'Rules'} tone="primary" />
        </Row>
        <T variant="caption">{target?.label}. Rewording only: your facts, numbers and tools stay the same.</T>

        {tailored.isPending ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}
        {tailored.error ? <T color="danger">{(tailored.error as Error).message}</T> : null}
        {tailored.data ? (
          <TailorBody key={tailored.data.suggestion} result={tailored.data} onAccept={onAccept} onClose={onClose} />
        ) : !tailored.isPending ? (
          <Button title="Close" variant="secondary" onPress={onClose} />
        ) : null}
      </ScrollView>
    </Modal>
  );
}

function TailorBody({ result, onAccept, onClose }: { result: TailorResult; onAccept: (t: string) => void; onClose: () => void }) {
  const c = useColors();
  const [edited, setEdited] = useState(result.suggestion);
  const unchanged = result.suggestion === result.original;
  return (
    <>
      <View style={{ gap: 6 }}>
        <T variant="label">Before</T>
        <View style={{ backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: space.md }}>
          <T color="textSecondary">{result.original}</T>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <T variant="label" color="success">After {unchanged ? '(no change suggested)' : ''}</T>
        <Field value={edited} onChangeText={setEdited} multiline />
      </View>
      <View style={{ gap: 4 }}>
        {result.changes.map((ch) => (
          <T key={ch} variant="caption">• {ch}</T>
        ))}
      </View>
      {result.considerIfTrue.length ? (
        <View style={{ gap: 6 }}>
          <T variant="caption" style={{ fontWeight: '600' }}>The job also mentions these. Add them only if you really used them here:</T>
          <Row wrap gap={6}>
            {result.considerIfTrue.map((s) => <Badge key={s} label={s} tone="warning" />)}
          </Row>
        </View>
      ) : null}
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        <Button title="Use this version" disabled={!edited.trim()} onPress={() => onAccept(edited.trim())} />
        <Button title="Keep original" variant="secondary" onPress={onClose} />
      </View>
    </>
  );
}
