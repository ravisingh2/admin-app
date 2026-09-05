import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMerchantOrderPage, MerchantOrder } from '@/services/api';

const STATUSES = [
  ['order_placed', 'Placed'],
  ['ready_to_dispatch', 'Ready to Dispatch'],
  ['assigned_to_rider', 'Assigned to Rider'],
  ['partial_dispatched', 'Partially Dispatched'],
  ['partial_completed', 'Partially Completed'],
  ['dispatched', 'Dispatched'],
  ['completed', 'Completed'],
  ['returned', 'Returned'],
  ['cancelled', 'Cancelled'],
  ['return_request', 'Return Request'],
] as const;

function labelStatus(status: string) { return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusTone(status: string) {
  if (status === 'completed') return { backgroundColor: '#E5F6EA', color: '#18864B' };
  if (status === 'cancelled' || status === 'returned') return { backgroundColor: '#FCE9EA', color: '#C7464E' };
  if (status.includes('return')) return { backgroundColor: '#FFF1DA', color: '#B56A12' };
  if (status.includes('dispatch')) return { backgroundColor: '#E8F1FB', color: '#3478B9' };
  return { backgroundColor: '#E9F6EE', color: '#176B45' };
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [status, setStatus] = useState('order_placed');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const scrollReady = useRef(false);
  const lastScrollY = useRef(0);

  const load = useCallback(async (nextPage: number, append = false, refresh = false) => {
    if (busy.current) return;
    busy.current = true;
    if (append) setLoadingMore(true); else if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const result = await getMerchantOrderPage({ page: nextPage, status, orderId: search });
      setOrders((current) => {
        const newOrders = append ? result.orders.filter((item) => !current.some((old) => old.orderId === item.orderId)) : result.orders;
        const combined = append ? [...current, ...newOrders] : newOrders;
        setHasMore(newOrders.length > 0 && combined.length < result.total);
        return combined;
      });
      setPage(nextPage + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Orders could not be loaded.'); }
    finally { busy.current = false; setLoading(false); setLoadingMore(false); setRefreshing(false); }
  }, [search, status]);

  useEffect(() => {
    scrollReady.current = false;
    lastScrollY.current = 0;
    const timer = setTimeout(() => void load(1), 350);
    return () => clearTimeout(timer);
  }, [status, search]);

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.title}>Orders</Text></View>
    <View style={styles.content}>
      <TextInput value={search} onChangeText={setSearch} placeholder="Search by order ID" placeholderTextColor="#999" autoCapitalize="none" style={styles.search} />
      <View style={styles.tabsWrap}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statuses}>{STATUSES.map(([value, label]) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: status === value }} key={value} onPress={() => { scrollReady.current = false; lastScrollY.current = 0; setOrders([]); setPage(1); setStatus(value); }} style={[styles.statusTab, status === value && styles.statusTabActive]}><Text style={[styles.statusTabText, status === value && styles.statusTabTextActive]}>{label}</Text></Pressable>)}</ScrollView></View>
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#3C8DBC" /><Text style={styles.muted}>Loading orders…</Text></View> : error && !orders.length ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load(1)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View> : <FlatList
        data={orders} keyExtractor={(item) => item.orderId} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, false, true)} />}
        onScroll={(event) => { const offset = event.nativeEvent.contentOffset.y; if (offset > lastScrollY.current + 4) scrollReady.current = true; lastScrollY.current = offset; }} scrollEventThrottle={16}
        onEndReached={() => { if (scrollReady.current && hasMore && !loading && !loadingMore && !refreshing) { scrollReady.current = false; void load(page, true); } }} onEndReachedThreshold={0.2}
        ListEmptyComponent={<View style={styles.center}><Text style={styles.muted}>No orders found.</Text></View>}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color="#3C8DBC" /> : null}
        renderItem={({ item }) => <View style={styles.card}>
          <View style={styles.cardTop}><Pressable onPress={() => router.push({ pathname: '/order-details', params: { orderId: item.orderId } })}><Text style={styles.orderId}>{item.orderId}  ›</Text></Pressable><View style={[styles.badge, { backgroundColor: statusTone(item.status).backgroundColor }]}><Text style={[styles.badgeText, { color: statusTone(item.status).color }]}>{labelStatus(item.status)}</Text></View></View>
          <Text style={styles.customer}>{item.userName}</Text><Text style={styles.address} numberOfLines={2}>{item.shippingAddress}</Text>
          <View style={styles.metrics}><View><Text style={styles.metricLabel}>Amount</Text><Text style={styles.amount}>{item.amount}</Text></View><View><Text style={styles.metricLabel}>Commission</Text><Text style={styles.metric}>{item.commissionAmount}</Text></View><View><Text style={styles.metricLabel}>Delivery</Text><Text style={styles.metric}>{item.deliveryDate}</Text><Text style={styles.slot}>{item.timeSlot}</Text></View></View>
          <Text style={styles.created}>Ordered: {item.createdDate}</Text>
        </View>}
      />}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F7F4' }, header: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, backgroundColor: '#176B45', borderBottomWidth: 1, borderBottomColor: '#145D3D' }, back: { width: 42 }, backText: { fontSize: 34, color: '#FFF' }, title: { fontSize: 22, fontWeight: '800', color: '#FFF' }, content: { flex: 1, width: '100%', maxWidth: 780, alignSelf: 'center', padding: 10 }, search: { height: 44, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DFE8E2', paddingHorizontal: 14, borderRadius: 12, shadowColor: '#173D2D', shadowOpacity: 0.06, shadowRadius: 5, elevation: 1 }, tabsWrap: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E1E9E4', marginVertical: 9, overflow: 'hidden' }, statuses: { paddingHorizontal: 3 }, statusTab: { minHeight: 43, justifyContent: 'center', paddingHorizontal: 15, borderBottomWidth: 3, borderBottomColor: 'transparent' }, statusTabActive: { backgroundColor: '#EDF7F0', borderBottomColor: '#176B45' }, statusTabText: { color: '#667', fontSize: 11, fontWeight: '700' }, statusTabTextActive: { color: '#176B45', fontWeight: '900' }, card: { backgroundColor: '#FFF', borderLeftWidth: 4, borderLeftColor: '#3E9A6D', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E3EBE6', shadowColor: '#173D2D', shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, cardTop: { flexDirection: 'row', alignItems: 'center' }, orderId: { color: '#176B45', fontSize: 14, fontWeight: '900' }, badge: { backgroundColor: '#E8F4FA', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 }, badgeText: { color: '#247BA5', fontSize: 9, fontWeight: '900' }, customer: { color: '#173D2D', fontSize: 15, fontWeight: '800', marginTop: 10 }, address: { color: '#718078', fontSize: 11, lineHeight: 16, marginTop: 3 }, metrics: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 11, borderTopWidth: 1, borderTopColor: '#E8EEE9' }, metricLabel: { color: '#94A29B', fontSize: 9, textTransform: 'uppercase', fontWeight: '700' }, amount: { color: '#13824F', fontSize: 15, fontWeight: '900', marginTop: 3 }, metric: { color: '#3E554A', fontSize: 12, fontWeight: '800', marginTop: 3 }, slot: { color: '#8B9A92', fontSize: 9, marginTop: 1 }, created: { color: '#9EAAA3', fontSize: 9, textAlign: 'right', marginTop: 10 }, center: { minHeight: 260, alignItems: 'center', justifyContent: 'center' }, muted: { color: '#718078', marginTop: 9 }, error: { color: '#A94442', textAlign: 'center' }, retry: { marginTop: 12, backgroundColor: '#176B45', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 }, retryText: { color: '#FFF', fontWeight: '700' }, footer: { padding: 18 },
});
