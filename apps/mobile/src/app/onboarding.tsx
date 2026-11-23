import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { profileIsValid, ProfileForm, type ProfileDraft } from '@/components/profile-form';
import { ResumeUploader } from '@/components/resume-uploader';
import { Button, Card, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space, useColors } from '@/theme';

/** Screen 1: Onboarding & career profile. Step 1 = preferences, step 2 = resume upload. */
export default function Onboarding() {
  const c = useColors();
  const { markOnboarded } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<ProfileDraft>({
    fullName: '',
    yearsExperience: 2,
    targetTitles: [],
    workArrangements: ['remote', 'onsite', 'hybrid'],
    marketScope: 'global',
    marketCountryCode: null,
    marketCity: null,
  });
  const save = useMutation({ mutationFn: () => api.updateMe(draft), onSuccess: () => setStep(2) });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.xs, marginTop: space.md }}>
            <T variant="label" color="primary">Step {step} of 2</T>
            <T variant="title">{step === 1 ? 'What are you looking for?' : 'Add your resume'}</T>
            <T color="textSecondary">
              {step === 1
                ? 'We use this to filter fresh jobs and show how well you match.'
                : 'We read it into an editable format, so you can tailor it for each job and export a clean PDF.'}
            </T>
          </View>

          {step === 1 ? (
            <ProfileForm value={draft} onChange={setDraft} />
          ) : (
            <Card style={{ gap: space.md }}>
              <ResumeUploader onUploaded={() => void markOnboarded()} />
              <T variant="caption">Text-based PDFs and Word documents work best. Scanned images can’t be read.</T>
            </Card>
          )}
          {save.error ? <T color="danger">{(save.error as Error).message}</T> : null}
        </ScrollView>

        <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background }}>
          {step === 1 ? (
            <Button title="Continue" onPress={() => save.mutate()} loading={save.isPending} disabled={!profileIsValid(draft)} />
          ) : (
            <Button title="Skip for now" variant="ghost" onPress={() => void markOnboarded()} />
          )}
          {step === 1 && !profileIsValid(draft) ? (
            <T variant="caption" style={{ textAlign: 'center' }}>Add at least one target role{draft.marketScope !== 'global' ? ' and finish choosing your market' : ''}.</T>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
