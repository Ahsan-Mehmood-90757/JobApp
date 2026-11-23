import { COUNTRIES, countryName } from '@jobapp/shared/countries';
import { MARKET_SCOPES, WORK_ARRANGEMENTS, type MarketScope, type WorkArrangement } from '@jobapp/shared/enums';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { flag, WORK_LABEL } from '@/lib/format';
import { font, radius, space, useColors } from '@/theme';
import { Chip, Field, Row, T } from './ui';

export interface MarketValue {
  scope: MarketScope;
  country: string | null;
  city: string | null;
}

const SCOPE_LABEL: Record<MarketScope, string> = { global: 'Global', country: 'Country', city: 'City' };
const SCOPE_HINT: Record<MarketScope, string> = {
  global: 'Jobs from anywhere in the world.',
  country: 'Jobs in one country, plus remote jobs open to it.',
  city: 'Onsite and hybrid jobs in one city, plus remote jobs in that country.',
};

export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels: Record<T, string> }) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surfaceMuted, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center', backgroundColor: active ? c.surface : 'transparent' }}>
            <Text style={{ fontSize: font.sm, fontWeight: active ? '700' : '500', color: active ? c.text : c.textSecondary }}>{labels[o]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Job market: Global, one country, or one city. */
export function MarketPicker({ value, onChange }: { value: MarketValue; onChange: (v: MarketValue) => void }) {
  const c = useColors();
  const markets = useQuery({ queryKey: ['markets'], queryFn: api.markets, staleTime: 10 * 60_000 });
  const [countryQuery, setCountryQuery] = useState('');
  const [cityQuery, setCityQuery] = useState('');

  const countries = useMemo(() => {
    const counts = new Map((markets.data ?? []).map((m) => [m.countryCode, m.jobCount]));
    const q = countryQuery.trim().toLowerCase();
    return Object.entries(COUNTRIES)
      .map(([code, name]) => ({ code, name, count: counts.get(code) ?? 0 }))
      .filter((x) => !q || x.name.toLowerCase().includes(q) || x.code.toLowerCase() === q)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [markets.data, countryQuery]);

  const cities = useMemo(() => {
    const m = markets.data?.find((x) => x.countryCode === value.country);
    const q = cityQuery.trim().toLowerCase();
    return (m?.cities ?? []).filter((x) => !q || x.city.toLowerCase().includes(q));
  }, [markets.data, value.country, cityQuery]);

  const setScope = (scope: MarketScope) =>
    onChange({ scope, country: scope === 'global' ? null : value.country, city: scope === 'city' ? value.city : null });

  return (
    <View style={{ gap: space.md }}>
      <Segmented options={MARKET_SCOPES} value={value.scope} onChange={setScope} labels={SCOPE_LABEL} />
      <T variant="caption">{SCOPE_HINT[value.scope]}</T>

      {value.scope !== 'global' ? (
        value.country && !countryQuery ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="subheading">{flag(value.country)} {countryName(value.country)}</T>
            <Pressable onPress={() => onChange({ ...value, country: null, city: null })} hitSlop={8}>
              <Text style={{ color: c.primary, fontWeight: '600' }}>Change</Text>
            </Pressable>
          </Row>
        ) : (
          <View style={{ gap: space.sm }}>
            <Field placeholder="Search countries" value={countryQuery} onChangeText={setCountryQuery} autoCorrect={false} />
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
              {countries.slice(0, 8).map((x, i) => (
                <Pressable
                  key={x.code}
                  onPress={() => {
                    setCountryQuery('');
                    onChange({ ...value, country: x.code, city: null });
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', justifyContent: 'space-between', padding: 12,
                    backgroundColor: pressed ? c.surfaceMuted : c.surface,
                    borderTopWidth: i ? 1 : 0, borderTopColor: c.border,
                  })}>
                  <Text style={{ color: c.text, fontSize: font.md }}>{flag(x.code)}  {x.name}</Text>
                  {x.count ? <Text style={{ color: c.textMuted, fontSize: font.sm }}>{x.count} jobs</Text> : null}
                </Pressable>
              ))}
            </View>
          </View>
        )
      ) : null}

      {value.scope === 'city' && value.country ? (
        <View style={{ gap: space.sm }}>
          <Field
            label="City"
            placeholder="e.g. London"
            value={value.city ?? cityQuery}
            onChangeText={(t) => {
              setCityQuery(t);
              onChange({ ...value, city: t.trim() ? t : null });
            }}
            autoCorrect={false}
          />
          {cities.length ? (
            <Row wrap>
              {cities.slice(0, 10).map((x) => (
                <Chip
                  key={x.city}
                  label={`${x.city} · ${x.jobCount}`}
                  selected={value.city?.toLowerCase() === x.city.toLowerCase()}
                  onPress={() => {
                    setCityQuery('');
                    onChange({ ...value, city: x.city });
                  }}
                />
              ))}
            </Row>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function isMarketComplete(v: MarketValue): boolean {
  if (v.scope === 'global') return true;
  if (!v.country) return false;
  return v.scope === 'country' || !!v.city?.trim();
}

/** Remote / Onsite / Hybrid, multi-select, at least one. */
export function WorkTypePicker({ value, onChange }: { value: WorkArrangement[]; onChange: (v: WorkArrangement[]) => void }) {
  return (
    <Row wrap>
      {WORK_ARRANGEMENTS.map((w) => {
        const on = value.includes(w);
        return (
          <Chip
            key={w}
            label={WORK_LABEL[w]}
            selected={on}
            onPress={() => {
              const next = on ? value.filter((x) => x !== w) : [...value, w];
              if (next.length) onChange(next);
            }}
          />
        );
      })}
    </Row>
  );
}
