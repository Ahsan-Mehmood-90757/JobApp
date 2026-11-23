import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResumeUploader } from '@/components/resume-uploader';
import { Badge, Button, Card, Chip, ErrorBox, Row, ScoreBadge, SectionTitle, T } from '@/components/ui';
import { api, type MatchAudit } from '@/lib/api';
import { experienceLabel, jobPlace, scoreTone, sourceLabel, timeAgo, WORK_LABEL } from '@/lib/format';
import { useBaseResume } from '@/lib/session';
import { space, useColors } from '@/theme';

/** Screen 3: Job detail & mismatch audit. */
export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.job(id) });
  const base = useBaseResume();
  const audit = useQuery({
    queryKey: ['audit', id, base.data?.id, base.data?.updatedAt],
    enabled: !!base.data,
    queryFn: () => api.audit(id, { resumeId: base.data!.id }),
  });
  const [showFull, setShowFull] = useState(false);

  if (job.error) return <ErrorBox error={job.error} onRetry={() => void job.refetch()} />;
  if (!job.data) return <ActivityIndicator style={{ marginTop: space.xxl }} />;
  const j = job.data;
  const description = j.descriptionRaw.trim();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: j.companyName }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 40 }}>
        <View style={{ gap: space.sm }}>
          <T variant="heading" selectable>{j.title}</T>
          <T color="textSecondary">{j.companyName} · {jobPlace(j)}</T>
          <Row wrap gap={6}>
            <Badge label={WORK_LABEL[j.workArrangement]} tone="primary" />
            <Badge label={experienceLabel(j)} />
            {j.seniorityTier ? <Badge label={j.seniorityTier[0]!.toUpperCase() + j.seniorityTier.slice(1)} /> : null}
            <Badge label={`via ${sourceLabel(j.sourcePlatform)}`} />
            <Badge label={`Posted ${timeAgo(j.postedAt ?? j.lastVerifiedAt)}`} />
          </Row>
        </View>

        <MatchCheck audit={audit.data} loading={audit.isPending && !!base.data} hasResume={!!base.data} loadingResume={base.isPending} jobId={j.id} />

        {j.coreSkills.length ? (
          <Card style={{ gap: space.sm }}>
            <SectionTitle>Skills in this posting</SectionTitle>
            <Row wrap gap={6}>
              {j.coreSkills.map((s) => {
                const have = audit.data?.matchedSkills.includes(s);
                const missing = audit.data?.missingSkills.includes(s);
                return <Badge key={s} label={`${have ? '✓ ' : ''}${s}`} tone={have ? 'success' : missing ? 'danger' : 'neutral'} />;
              })}
            </Row>
          </Card>
        ) : null}

        {description ? (
          <Card style={{ gap: space.sm }}>
            <SectionTitle>Job description</SectionTitle>
            <T selectable numberOfLines={showFull ? undefined : 14}>{description}</T>
            {description.length > 700 ? (
              <Pressable onPress={() => setShowFull((v) => !v)} hitSlop={8}>
                <T style={{ color: c.primary, fontWeight: '600' }}>{showFull ? 'Show less' : 'Read full description'}</T>
              </Pressable>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background }}>
        <Button
          title="Edit Resume & Apply"
          disabled={!base.data}
          onPress={() => router.push({ pathname: '/editor', params: { jobId: j.id } })}
        />
        <Button title="Apply without changes ↗" variant="ghost" small onPress={() => void WebBrowser.openBrowserAsync(j.applyUrl)} />
      </View>
    </SafeAreaView>
  );
}

function MatchCheck({ audit, loading, hasResume, loadingResume, jobId }: { audit?: MatchAudit; loading: boolean; hasResume: boolean; loadingResume: boolean; jobId: string }) {
  if (loadingResume || loading) {
    return (
      <Card style={{ alignItems: 'center', padding: space.xl }}>
        <ActivityIndicator />
      </Card>
    );
  }
  if (!hasResume) {
    return (
      <Card style={{ gap: space.md }}>
        <SectionTitle>Resume match check</SectionTitle>
        <T color="textSecondary">Upload your resume to see how well you match this job and what to fix.</T>
        <ResumeUploader />
      </Card>
    );
  }
  if (!audit) return null;
  return <MatchSummary audit={audit} jobId={jobId} />;
}

function MatchSummary({ audit, jobId }: { audit: MatchAudit; jobId: string }) {
  const c = useColors();
  const tone = scoreTone(audit.score);
  const verdict = tone === 'success' ? 'Strong match' : tone === 'warning' ? 'Partial match' : 'Weak match';

  return (
    <Card style={{ gap: space.md }}>
      <SectionTitle>Resume match check</SectionTitle>
      <Row gap={space.lg}>
        <ScoreBadge score={audit.score} size="lg" />
        <View style={{ flex: 1, gap: 4 }}>
          <T variant="subheading" color={tone}>{verdict}</T>
          <T variant="caption">Skills {audit.skillScore}% · Experience {audit.experienceScore}%</T>
          <T variant="caption">
            {audit.requiredYears == null
              ? `No experience requirement stated. You have ${audit.resumeYears} yrs.`
              : audit.experienceGapYears > 0
                ? `Asks for ${audit.requiredYears}+ yrs. Your resume shows ${audit.resumeYears} yrs (${audit.experienceGapYears} short).`
                : `Asks for ${audit.requiredYears}+ yrs. You have ${audit.resumeYears} yrs. ✓`}
          </T>
        </View>
      </Row>

      {audit.missingSkills.length ? (
        <View style={{ gap: 6 }}>
          <T variant="caption" style={{ fontWeight: '600' }}>Missing from your resume</T>
          <Row wrap gap={6}>
            {audit.missingSkills.map((s) => <Badge key={s} label={s} tone="danger" />)}
          </Row>
          <T variant="caption" color="textMuted">Only add these if you’ve really used them.</T>
        </View>
      ) : null}

      {audit.unevidencedSkills.length ? (
        <View style={{ gap: 6 }}>
          <T variant="caption" style={{ fontWeight: '600' }}>Listed but never shown in a bullet</T>
          <Row wrap gap={6}>
            {audit.unevidencedSkills.map((s) => <Badge key={s} label={s} tone="warning" />)}
          </Row>
        </View>
      ) : null}

      {audit.recommendations.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="caption" style={{ fontWeight: '600' }}>Bullets to improve</T>
          {audit.recommendations.slice(0, 3).map((r) => (
            <Pressable
              key={`${r.experienceId}-${r.bulletIndex}`}
              onPress={() => router.push({ pathname: '/editor', params: { jobId, focus: `${r.experienceId}:${r.bulletIndex}` } })}>
              <View style={{ gap: 2, paddingLeft: space.sm, borderLeftWidth: 3, borderLeftColor: c.warning }}>
                <T numberOfLines={2}>“{r.bullet}”</T>
                <T variant="caption">{r.reasons[0]}</T>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Row wrap>
          <Chip label="✓ Your bullets look strong for this role" tone="success" />
        </Row>
      )}
    </Card>
  );
}
