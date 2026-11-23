import type { Job } from '@jobapp/shared';
import { memo } from 'react';
import { View } from 'react-native';
import { experienceLabel, jobPlace, sourceLabel, timeAgo, WORK_LABEL } from '@/lib/format';
import { space } from '@/theme';
import { Badge, Card, Row, ScoreBadge, T } from './ui';

export const JobCard = memo(function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ gap: space.sm }}>
      <Row style={{ alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading" numberOfLines={2}>{job.title}</T>
          <T color="textSecondary" numberOfLines={1}>{job.companyName}</T>
        </View>
        {job.matchScore != null ? <ScoreBadge score={job.matchScore} /> : null}
      </Row>
      <T variant="caption" numberOfLines={1}>{jobPlace(job)}</T>
      <Row wrap gap={6}>
        <Badge label={WORK_LABEL[job.workArrangement]} tone={job.workArrangement === 'remote' ? 'primary' : job.workArrangement === 'hybrid' ? 'warning' : 'neutral'} />
        <Badge label={experienceLabel(job)} />
        <Badge label={sourceLabel(job.sourcePlatform)} />
        <View style={{ flex: 1 }} />
        <T variant="caption" color="textMuted">{timeAgo(job.postedAt ?? job.lastVerifiedAt)}</T>
      </Row>
    </Card>
  );
});
