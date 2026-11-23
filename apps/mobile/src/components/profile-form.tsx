import type { UserPreferences } from '@jobapp/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { space } from '@/theme';
import { isMarketComplete, MarketPicker, WorkTypePicker } from './market-picker';
import { Card, Chip, Field, Row, SectionTitle, Stepper, T } from './ui';

export type ProfileDraft = Pick<
  UserPreferences,
  'fullName' | 'yearsExperience' | 'targetTitles' | 'workArrangements' | 'marketScope' | 'marketCountryCode' | 'marketCity'
>;

export function profileIsValid(p: ProfileDraft): boolean {
  return (
    p.targetTitles.length > 0 &&
    p.workArrangements.length > 0 &&
    isMarketComplete({ scope: p.marketScope, country: p.marketCountryCode, city: p.marketCity })
  );
}

const SUGGESTED_TITLES = ['Software Engineer', 'Product Manager', 'Data Analyst', 'Designer', 'Marketing Manager', 'Account Executive'];

export function ProfileForm({ value, onChange }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void }) {
  const [titleInput, setTitleInput] = useState('');
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...value, ...patch });

  const addTitle = (t: string) => {
    const title = t.trim();
    if (!title || value.targetTitles.some((x) => x.toLowerCase() === title.toLowerCase()) || value.targetTitles.length >= 10) return;
    set({ targetTitles: [...value.targetTitles, title] });
    setTitleInput('');
  };

  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.md }}>
        <SectionTitle>Target roles</SectionTitle>
        {value.targetTitles.length ? (
          <Row wrap>
            {value.targetTitles.map((t) => (
              <Chip key={t} label={t} selected onRemove={() => set({ targetTitles: value.targetTitles.filter((x) => x !== t) })} />
            ))}
          </Row>
        ) : null}
        <Field
          placeholder="Add a job title and press return"
          value={titleInput}
          onChangeText={setTitleInput}
          onSubmitEditing={() => addTitle(titleInput)}
          returnKeyType="done"
          submitBehavior="submit"
        />
        {value.targetTitles.length === 0 ? (
          <Row wrap>
            {SUGGESTED_TITLES.map((t) => (
              <Chip key={t} label={`+ ${t}`} onPress={() => addTitle(t)} />
            ))}
          </Row>
        ) : null}
      </Card>

      <Card style={{ gap: space.md, alignItems: 'stretch' }}>
        <SectionTitle>Total experience</SectionTitle>
        <View style={{ alignItems: 'center' }}>
          <Stepper value={value.yearsExperience} onChange={(n) => set({ yearsExperience: n })} suffix={value.yearsExperience === 1 ? 'year' : 'years'} />
        </View>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionTitle>Work type</SectionTitle>
        <WorkTypePicker value={value.workArrangements} onChange={(w) => set({ workArrangements: w })} />
        <T variant="caption">Pick any combination.</T>
      </Card>

      <Card style={{ gap: space.md }}>
        <SectionTitle>Job market</SectionTitle>
        <MarketPicker
          value={{ scope: value.marketScope, country: value.marketCountryCode, city: value.marketCity }}
          onChange={(m) => set({ marketScope: m.scope, marketCountryCode: m.country, marketCity: m.city })}
        />
      </Card>

      <Card style={{ gap: space.md }}>
        <Field label="Your name (optional)" placeholder="Full name" value={value.fullName} onChangeText={(t) => set({ fullName: t })} autoComplete="name" />
      </Card>
    </View>
  );
}
