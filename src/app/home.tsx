import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { setAuthenticated } from '@/services/api';

const actions = [
  { icon: '▦', title: 'Browse products', caption: 'Explore the latest items', color: '#E4F3E8', route: '/products' as const },
  { icon: '⌁', title: 'Manage orders', caption: 'View and update merchant orders', color: '#FFF1DA', route: '/orders' as const },
  { icon: '♡', title: 'Saved items', caption: 'Return to your favourites', color: '#F6EAF1' },
  { icon: '◉', title: 'My account', caption: 'Details and preferences', color: '#E8EFF8' },
];

export default function HomeScreen() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const displayName = typeof name === 'string' && name ? name : 'there';
  const signOut = () => { setAuthenticated(false); router.replace('/'); };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ACCRABASKET</Text>
            <Text style={styles.greeting}>Hello, {displayName}</Text>
          </View>
          <Pressable accessibilityLabel="Sign out" onPress={signOut} style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </Pressable>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Quick access</Text>
          <Text style={styles.sectionMeta}>Your shortcuts</Text>
        </View>
        <View style={styles.grid}>
          {actions.map((action) => (
            <Pressable key={action.title} onPress={() => { if (action.route) router.navigate(action.route); }} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
              <View style={[styles.actionIcon, { backgroundColor: action.color }]}><Text style={styles.actionIconText}>{action.icon}</Text></View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionCaption}>{action.caption}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✓</Text></View>
          <View style={styles.emptyCopy}><Text style={styles.emptyTitle}>You’re all caught up</Text><Text style={styles.emptyText}>Your recent activity and order updates will appear here.</Text></View>
        </View>

        <Pressable onPress={signOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7FAF7' },
  page: { width: '100%', maxWidth: 780, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8, color: '#4F8069' },
  greeting: { fontSize: 25, lineHeight: 33, fontWeight: '800', color: '#173D2D', marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#176B45' },
  avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 15 },
  sectionTitle: { color: '#173D2D', fontSize: 19, fontWeight: '800' },
  sectionMeta: { color: '#7C8D84', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginBottom: 20 },
  actionCard: { width: '47%', flexGrow: 1, minWidth: 145, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 17, margin: 6, borderWidth: 1, borderColor: '#E5ECE7' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  actionIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  actionIconText: { color: '#245640', fontSize: 20, fontWeight: '700' },
  actionTitle: { color: '#244536', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  actionCaption: { color: '#809087', fontSize: 12, lineHeight: 17 },
  emptyCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, backgroundColor: '#EDF6EF', padding: 18 },
  emptyIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#CDE9D5', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  emptyIconText: { color: '#176B45', fontSize: 17, fontWeight: '900' },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: '#244536', fontSize: 14, fontWeight: '800', marginBottom: 3 },
  emptyText: { color: '#718078', fontSize: 12, lineHeight: 17 },
  signOut: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 14, marginTop: 18 },
  signOutText: { color: '#64766D', fontSize: 13, fontWeight: '700' },
});
