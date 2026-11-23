import type { Resume, ResumeEducation, ResumeExperience } from '@jobapp/shared';
import { useState, type ReactNode } from 'react';
import { Alert, LayoutAnimation, Pressable, Text, View } from 'react-native';
import { font, radius, space, useColors } from '@/theme';
import { Badge, Button, Card, Chip, Field, Row, T } from './ui';

type SectionKey = 'contact' | 'summary' | 'experience' | 'skills' | 'education';

export interface TailorContext {
  /** Opens the before/after sheet; resolves the accepted text into the resume. */
  tailor: (text: string, label: string, apply: (next: string) => void) => void;
  missingSkills: string[];
  /** "exp_1:0" → highlight that bullet (from the match check). */
  focus?: string;
}

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Accordion({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md, backgroundColor: pressed ? c.surfaceMuted : 'transparent' })}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{title}</T>
          {summary && !open ? <T variant="caption" numberOfLines={1}>{summary}</T> : null}
        </View>
        <Text style={{ color: c.textMuted, fontSize: 18, transform: [{ rotate: open ? '90deg' : '0deg' }] }}>›</Text>
      </Pressable>
      {open ? <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>{children}</View> : null}
    </Card>
  );
}

function SmallAction({ label, onPress, tone = 'primary' }: { label: string; onPress: () => void; tone?: 'primary' | 'danger' | 'muted' }) {
  const c = useColors();
  const color = tone === 'danger' ? c.danger : tone === 'muted' ? c.textSecondary : c.primary;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text style={{ color, fontWeight: '600', fontSize: font.sm }}>{label}</Text>
    </Pressable>
  );
}

/** Screen 4 body: accordion editor for every section of the canonical resume JSON. */
export function ResumeEditor({ value, onChange, tailor }: { value: Resume; onChange: (r: Resume) => void; tailor?: TailorContext }) {
  const c = useColors();
  const focusExp = tailor?.focus?.split(':')[0];
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    contact: false,
    summary: !!tailor && !focusExp,
    experience: true,
    skills: false,
    education: false,
  });
  const [skillInput, setSkillInput] = useState('');
  const toggle = (k: SectionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const set = (patch: Partial<Resume>) => onChange({ ...value, ...patch });

  const updateExp = (id: string, patch: Partial<ResumeExperience>) =>
    set({ experience: value.experience.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const updateEdu = (id: string, patch: Partial<ResumeEducation>) =>
    set({ education: value.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const addSkill = (raw: string) => {
    const s = raw.trim();
    if (!s || value.skills.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    set({ skills: [...value.skills, s] });
    setSkillInput('');
  };

  const confirmRemove = (what: string, onYes: () => void) =>
    Alert.alert(`Remove ${what}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onYes },
    ]);

  return (
    <View style={{ gap: space.md }}>
      <Accordion title="Contact" summary={[value.contact.fullName, value.contact.email].filter(Boolean).join(' · ')} open={open.contact} onToggle={() => toggle('contact')}>
        <Field label="Full name" value={value.contact.fullName} onChangeText={(t) => set({ contact: { ...value.contact, fullName: t } })} autoComplete="name" />
        <Field label="Email" value={value.contact.email} onChangeText={(t) => set({ contact: { ...value.contact, email: t } })} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Phone" value={value.contact.phone} onChangeText={(t) => set({ contact: { ...value.contact, phone: t } })} keyboardType="phone-pad" />
        <Field label="Location" value={value.contact.location} onChangeText={(t) => set({ contact: { ...value.contact, location: t } })} placeholder="City, Country" />
        <Field label="LinkedIn" value={value.contact.linkedinUrl} onChangeText={(t) => set({ contact: { ...value.contact, linkedinUrl: t } })} autoCapitalize="none" keyboardType="url" />
        <Field label="Portfolio / GitHub" value={value.contact.portfolioUrl} onChangeText={(t) => set({ contact: { ...value.contact, portfolioUrl: t } })} autoCapitalize="none" keyboardType="url" />
      </Accordion>

      <Accordion title="Summary" summary={value.summary || 'Not added'} open={open.summary} onToggle={() => toggle('summary')}>
        <Field value={value.summary} onChangeText={(t) => set({ summary: t })} multiline placeholder="2–3 sentences about what you do best" />
        {tailor && value.summary.trim().length > 10 ? (
          <Row>
            <SmallAction label="✨ Tailor to this job" onPress={() => tailor.tailor(value.summary, 'Summary', (t) => set({ summary: t }))} />
          </Row>
        ) : null}
      </Accordion>

      <Accordion title="Experience" summary={`${value.experience.length} roles`} open={open.experience} onToggle={() => toggle('experience')}>
        {value.experience.map((e, ei) => (
          <View key={e.id} style={{ gap: space.sm, paddingTop: ei ? space.md : 0, borderTopWidth: ei ? 1 : 0, borderTopColor: c.border }}>
            <Field label="Role title" value={e.roleTitle} onChangeText={(t) => updateExp(e.id, { roleTitle: t })} />
            <Field label="Company" value={e.company} onChangeText={(t) => updateExp(e.id, { company: t })} />
            <Row gap={space.sm}>
              <Field style={{ flex: 1 }} label="Start" value={e.startDate} onChangeText={(t) => updateExp(e.id, { startDate: t })} placeholder="2022-01" />
              <Field style={{ flex: 1 }} label="End" value={e.endDate} onChangeText={(t) => updateExp(e.id, { endDate: t })} placeholder="Present" />
            </Row>
            <Field label="Location" value={e.location} onChangeText={(t) => updateExp(e.id, { location: t })} placeholder="City or Remote" />

            <T variant="caption" style={{ fontWeight: '600', marginTop: space.xs }}>Bullets</T>
            {e.bullets.map((b, bi) => {
              const focused = tailor?.focus === `${e.id}:${bi}`;
              return (
                <View
                  key={`${e.id}-${bi}`}
                  style={{ gap: 6, padding: focused ? space.sm : 0, borderRadius: radius.md, backgroundColor: focused ? c.warningSoft : 'transparent' }}>
                  <Field
                    value={b}
                    multiline
                    onChangeText={(t) => updateExp(e.id, { bullets: e.bullets.map((x, i) => (i === bi ? t : x)) })}
                  />
                  <Row gap={space.lg} style={{ justifyContent: 'flex-end' }}>
                    {tailor && b.trim().length > 5 ? (
                      <SmallAction
                        label="✨ Tailor to this job"
                        onPress={() =>
                          tailor.tailor(b, `${e.roleTitle || 'Role'} at ${e.company || 'company'}`, (t) =>
                            updateExp(e.id, { bullets: e.bullets.map((x, i) => (i === bi ? t : x)) }),
                          )
                        }
                      />
                    ) : null}
                    <SmallAction label="Delete" tone="danger" onPress={() => updateExp(e.id, { bullets: e.bullets.filter((_, i) => i !== bi) })} />
                  </Row>
                </View>
              );
            })}
            <Row style={{ justifyContent: 'space-between' }}>
              <SmallAction label="+ Add bullet" onPress={() => updateExp(e.id, { bullets: [...e.bullets, ''] })} />
              <SmallAction
                label="Remove role"
                tone="danger"
                onPress={() => confirmRemove(e.roleTitle || 'this role', () => set({ experience: value.experience.filter((x) => x.id !== e.id) }))}
              />
            </Row>
          </View>
        ))}
        <Button
          title="Add role"
          icon="+"
          variant="secondary"
          small
          onPress={() =>
            set({ experience: [...value.experience, { id: newId('exp'), roleTitle: '', company: '', location: '', startDate: '', endDate: 'Present', bullets: [''] }] })
          }
        />
      </Accordion>

      <Accordion title="Skills" summary={value.skills.slice(0, 6).join(', ') || 'Not added'} open={open.skills} onToggle={() => toggle('skills')}>
        <Row wrap gap={6}>
          {value.skills.map((s) => (
            <Chip key={s} label={s} onRemove={() => set({ skills: value.skills.filter((x) => x !== s) })} />
          ))}
        </Row>
        <Field placeholder="Add a skill and press return" value={skillInput} onChangeText={setSkillInput} onSubmitEditing={() => addSkill(skillInput)} submitBehavior="submit" returnKeyType="done" />
        {tailor?.missingSkills.length ? (
          <View style={{ gap: 6 }}>
            <T variant="caption">The job asks for these. Tap to add only the ones you really have:</T>
            <Row wrap gap={6}>
              {tailor.missingSkills
                .filter((s) => !value.skills.some((x) => x.toLowerCase() === s.toLowerCase()))
                .map((s) => (
                  <Chip key={s} label={`+ ${s}`} tone="warning" onPress={() => addSkill(s)} />
                ))}
            </Row>
          </View>
        ) : null}
      </Accordion>

      <Accordion title="Education" summary={value.education.map((e) => e.degree || e.institution).join(' · ') || 'Not added'} open={open.education} onToggle={() => toggle('education')}>
        {value.education.map((e, i) => (
          <View key={e.id} style={{ gap: space.sm, paddingTop: i ? space.md : 0, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <Field label="Degree" value={e.degree} onChangeText={(t) => updateEdu(e.id, { degree: t })} placeholder="B.S. Computer Science" />
            <Field label="Institution" value={e.institution} onChangeText={(t) => updateEdu(e.id, { institution: t })} />
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Field style={{ width: 120 }} label="Year" value={e.graduationYear} onChangeText={(t) => updateEdu(e.id, { graduationYear: t })} keyboardType="number-pad" maxLength={4} />
              <SmallAction label="Remove" tone="danger" onPress={() => confirmRemove(e.degree || 'this entry', () => set({ education: value.education.filter((x) => x.id !== e.id) }))} />
            </Row>
          </View>
        ))}
        <Button
          title="Add education"
          icon="+"
          variant="secondary"
          small
          onPress={() => set({ education: [...value.education, { id: newId('edu'), degree: '', institution: '', graduationYear: '' }] })}
        />
      </Accordion>

      {tailor ? <Badge label="Changes here apply to this job's version only, unless you save them to your base resume." /> : null}
    </View>
  );
}

/** Drop empty bullets/entries before saving or exporting. */
export function cleanResume(r: Resume): Resume {
  return {
    ...r,
    summary: r.summary.trim(),
    experience: r.experience.map((e) => ({ ...e, bullets: e.bullets.map((b) => b.trim()).filter(Boolean) })).filter((e) => e.roleTitle || e.company || e.bullets.length),
    skills: r.skills.map((s) => s.trim()).filter(Boolean),
    education: r.education.filter((e) => e.degree || e.institution),
  };
}
