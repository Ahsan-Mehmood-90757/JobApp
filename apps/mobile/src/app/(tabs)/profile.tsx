import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { profileIsValid, ProfileForm, type ProfileDraft } from '@/components/profile-form';
import { Button, ErrorBox, T } from '@/components/ui';
import { api, type Profile } from '@/lib/api';
import { useInvalidateUserData, useProfile } from '@/lib/session';
import { space, useColors } from '@/theme';

export default function ProfileScreen() {
  const profile = useProfile();
  if (profile.error) return <ErrorBox error={profile.error} onRetry={() => void profile.refetch()} />;
  if (!profile.data) return null;
  // Keyed so the form re-initialises when the saved profile changes.
  return <ProfileEditor key={JSON.stringify(profile.data)} saved={profile.data} />;
}

function ProfileEditor({ saved }: { saved: Profile }) {
  const c = useColors();
  const invalidate = useInvalidateUserData();
  const [draft, setDraft] = useState<ProfileDraft>(saved);
  const [justSaved, setJustSaved] = useState(false);

  const save = useMutation({
    mutationFn: (d: ProfileDraft) => api.updateMe(d),
    onSuccess: () => {
      setJustSaved(true);
      invalidate();
    },
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <T variant="title">Profile</T>
          <ProfileForm value={draft} onChange={setDraft} />
        </ScrollView>
        {dirty || justSaved ? (
          <View style={{ padding: space.lg, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background, gap: space.xs }}>
            {dirty ? (
              <Button title="Save changes" onPress={() => save.mutate(draft)} loading={save.isPending} disabled={!profileIsValid(draft)} />
            ) : (
              <T variant="caption" color="success" style={{ textAlign: 'center' }}>✓ Saved. Your job feed now uses these settings.</T>
            )}
            {save.error ? <T variant="caption" color="danger">{(save.error as Error).message}</T> : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
