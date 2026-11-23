import { NativeTabs } from 'expo-router/native-tabs';
import { useColors } from '@/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <NativeTabs backgroundColor={c.surface} tintColor={c.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Jobs</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'briefcase', selected: 'briefcase.fill' }} md="work" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="resume">
        <NativeTabs.Trigger.Label>Resume</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md="description" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
