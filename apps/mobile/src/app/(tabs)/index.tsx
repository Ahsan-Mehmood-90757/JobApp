import type { MarketScope, WorkArrangement } from '@jobapp/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JobCard } from '@/components/job-card';
import { isMarketComplete, MarketPicker, WorkTypePicker, type MarketValue } from '@/components/market-picker';
import { Button, Chip, EmptyState, ErrorBox, Field, Row, T } from '@/components/ui';
import { api, type JobFilters } from '@/lib/api';
import { marketLabel, WORK_LABEL } from '@/lib/format';
import { useProfile } from '@/lib/session';
import { font, space, useColors } from '@/theme';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Screen 2: Job discovery feed. */
export default function JobsFeed() {
  const c = useColors();
  const profile = useProfile();
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 350);
  const [matchMyExp, setMatchMyExp] = useState(true);
  const [recentOnly, setRecentOnly] = useState(false);
  const [workTypes, setWorkTypes] = useState<WorkArrangement[] | null>(null);
  const [market, setMarket] = useState<MarketValue | null>(null);
  const [sheet, setSheet] = useState<'market' | 'work' | null>(null);
  const [draftMarket, setDraftMarket] = useState<MarketValue | null>(null);

  // Defaults come from the profile; the chips override them for this session.
  const p = profile.data;
  const effectiveWork = useMemo<WorkArrangement[]>(() => workTypes ?? p?.workArrangements ?? ['remote', 'onsite', 'hybrid'], [workTypes, p?.workArrangements]);
  const effectiveMarket: MarketValue = market ?? { scope: (p?.marketScope ?? 'global') as MarketScope, country: p?.marketCountryCode ?? null, city: p?.marketCity ?? null };
  const years = p?.yearsExperience ?? 0;

  const filters: JobFilters = useMemo(
    () => ({
      q,
      maxExperience: matchMyExp ? years : undefined,
      market: effectiveMarket.scope,
      country: effectiveMarket.country,
      city: effectiveMarket.city,
      workTypes: effectiveWork,
      postedWithinDays: recentOnly ? 7 : undefined,
    }),
    [q, matchMyExp, years, effectiveMarket.scope, effectiveMarket.country, effectiveMarket.city, effectiveWork, recentOnly],
  );

  const feed = useInfiniteQuery({
    queryKey: ['jobs', filters],
    enabled: !!p,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.jobs(filters, pageParam),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const jobs = feed.data?.pages.flatMap((pg) => pg.items) ?? [];
  const total = feed.data?.pages[0]?.total ?? 0;
  const workLabel = effectiveWork.length === 3 ? 'Any work type' : effectiveWork.map((w) => WORK_LABEL[w]).join(' + ');

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <T variant="title">Jobs</T>
      <Field placeholder="Search title, company or skill" value={query} onChangeText={setQuery} returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        <Chip label={`${marketLabel(effectiveMarket.scope, effectiveMarket.country, effectiveMarket.city)} ▾`} selected onPress={() => { setDraftMarket(effectiveMarket); setSheet('market'); }} />
        <Chip label={`${workLabel} ▾`} selected={effectiveWork.length < 3} onPress={() => setSheet('work')} />
        <Chip label={`Matches my ${years} yrs`} selected={matchMyExp} onPress={() => setMatchMyExp((v) => !v)} />
        <Chip label="Last 7 days" selected={recentOnly} onPress={() => setRecentOnly((v) => !v)} />
      </ScrollView>
      {feed.data ? <T variant="caption">{total.toLocaleString()} {total === 1 ? 'job' : 'jobs'}</T> : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        renderItem={({ item }) => <JobCard job={item} onPress={() => router.push({ pathname: '/job/[id]', params: { id: item.id } })} />}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }}
        keyboardDismissMode="on-drag"
        onEndReachedThreshold={0.4}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && void feed.fetchNextPage()}
        refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} />}
        ListEmptyComponent={
          feed.isPending ? (
            <ActivityIndicator style={{ marginTop: space.xxl }} />
          ) : feed.error ? (
            <ErrorBox error={feed.error} onRetry={() => void feed.refetch()} />
          ) : (
            <EmptyState
              title="No jobs match these filters"
              message="Try a wider market, more work types, or turn off the experience filter."
              action={matchMyExp ? <Button title="Show all experience levels" variant="secondary" onPress={() => setMatchMyExp(false)} /> : undefined}
            />
          )
        }
        ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator style={{ marginTop: space.lg }} /> : undefined}
      />

      <Modal visible={sheet !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <Row style={{ justifyContent: 'space-between', padding: space.lg }}>
            <T variant="heading">{sheet === 'market' ? 'Job market' : 'Work type'}</T>
            <Pressable onPress={() => setSheet(null)} hitSlop={10}>
              <T style={{ color: c.primary, fontSize: font.md, fontWeight: '600' }}>Cancel</T>
            </Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
            {sheet === 'market' && draftMarket ? (
              <>
                <MarketPicker value={draftMarket} onChange={setDraftMarket} />
                <Button
                  title="Show jobs"
                  disabled={!isMarketComplete(draftMarket)}
                  onPress={() => {
                    setMarket(draftMarket);
                    setSheet(null);
                  }}
                />
              </>
            ) : null}
            {sheet === 'work' ? (
              <>
                <WorkTypePicker value={effectiveWork} onChange={setWorkTypes} />
                <Button title="Done" onPress={() => setSheet(null)} />
              </>
            ) : null}
            <T variant="caption">This changes the feed only. Edit your defaults in Profile.</T>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
