import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMerchantOrderDetails, MerchantOrderDetails, updateMerchantOrderStatus } from '@/services/api';

function pack(quantity: number | string, unit: string) {
  const units: Record<string, string> = { grams: 'g', gram: 'g', gm: 'g', kg: 'kg', liter: 'L', ml: 'ml', Piece: ' pcs', sticks: ' sticks' };
  return quantity === '' ? '' : `${quantity}${units[unit] ?? unit}`;
}

export default function OrderDetailsScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [order, setOrder] = useState<MerchantOrderDetails | null>(null);
  const [error, setError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!orderId) return setError('Order ID is missing.');
    getMerchantOrderDetails(orderId).then(setOrder).catch((reason) => setError(reason instanceof Error ? reason.message : 'Order details could not be loaded.'));
  }, [orderId]);

  const markReadyToDispatch = async () => {
    if (!order || order.status !== 'order_placed' || updatingStatus) return;
    try {
      setUpdatingStatus(true);
      await updateMerchantOrderStatus(order.orderId, order.userId, 'ready_to_dispatch');
      setOrder((current) => current ? { ...current, status: 'ready_to_dispatch' } : current);
      Alert.alert('Status updated', 'The order is now ready to dispatch.');
    } catch (reason) {
      Alert.alert('Could not update status', reason instanceof Error ? reason.message : 'Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View><Text style={styles.title}>Order Details</Text><Text style={styles.orderId}>{orderId}</Text></View></View>
    {!order && !error ? <View style={styles.center}><ActivityIndicator size="large" color="#3C8DBC" /><Text style={styles.muted}>Loading order…</Text></View> : error ? <View style={styles.center}><Text style={styles.error}>{error}</Text></View> : order && <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.summary}><View style={styles.summaryTop}><Text style={styles.customer}>{order.userName}</Text><Text style={styles.status}>{order.status.replace(/_/g, ' ')}</Text></View><Text style={styles.address}>{order.shippingAddress}</Text><View style={styles.delivery}><Text style={styles.small}>Delivery: {order.deliveryDate}</Text><Text style={styles.small}>Time: {order.timeSlot}</Text></View>{order.status === 'order_placed' && <Pressable disabled={updatingStatus} onPress={markReadyToDispatch} style={({ pressed }) => [styles.readyButton, pressed && styles.readyButtonPressed, updatingStatus && styles.readyButtonDisabled]}>{updatingStatus ? <ActivityIndicator color="#FFF" /> : <><Text style={styles.readyButtonText}>Mark Ready to Dispatch</Text><Text style={styles.readyButtonArrow}>›</Text></>}</Pressable>}</View>
      <Text style={styles.sectionTitle}>Ordered Products</Text>
      {order.items.map((item, index) => <View key={`${item.id}-${index}`} style={styles.item}>
        <View style={styles.itemTop}><View style={styles.productImageWrap}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImage} contentFit="cover" /> : <Text style={styles.imagePlaceholder}>{item.productName.charAt(0).toUpperCase()}</Text>}</View><View style={styles.itemCopy}><Text style={styles.productName}>{item.productName}</Text>{item.packQuantity !== '' && <Text style={styles.pack}>{pack(item.packQuantity, item.unit)}</Text>}</View><Text style={styles.itemAmount}>{item.amount.toFixed(2)}</Text></View>
        <View style={styles.itemBottom}><Text style={styles.itemMeta}>Ordered quantity: <Text style={styles.strong}>{item.orderedQuantity}</Text></Text><Text style={styles.itemMeta}>Price: <Text style={styles.strong}>{item.unitPrice.toFixed(2)}</Text></Text></View>
      </View>)}
      {!order.items.length && <Text style={styles.empty}>No ordered products found.</Text>}
      <View style={styles.total}><Text style={styles.totalLabel}>Order Total</Text><Text style={styles.totalValue}>{Number(order.amount).toFixed(2)}</Text></View>
    </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ECF0F5' }, header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#D2D6DE' }, back: { width: 42 }, backText: { fontSize: 34, color: '#444' }, title: { fontSize: 21, fontWeight: '700', color: '#333' }, orderId: { color: '#3C8DBC', fontSize: 11, fontWeight: '700', marginTop: 1 }, page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 10, paddingBottom: 35 }, summary: { backgroundColor: '#FFF', borderTopWidth: 3, borderTopColor: '#3C8DBC', padding: 14, marginBottom: 14 }, summaryTop: { flexDirection: 'row', alignItems: 'center' }, customer: { flex: 1, color: '#333', fontSize: 16, fontWeight: '800' }, status: { color: '#247BA5', backgroundColor: '#E8F4FA', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, fontSize: 9, fontWeight: '800', textTransform: 'capitalize' }, address: { color: '#777', fontSize: 11, lineHeight: 16, marginTop: 5 }, delivery: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#EEE' }, small: { color: '#666', fontSize: 10 }, readyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#176B45', borderRadius: 9, marginTop: 12, paddingHorizontal: 14 }, readyButtonPressed: { opacity: 0.78 }, readyButtonDisabled: { opacity: 0.65 }, readyButtonText: { color: '#FFF', fontSize: 12, fontWeight: '800' }, readyButtonArrow: { color: '#FFF', fontSize: 21, marginLeft: 8 }, sectionTitle: { color: '#333', fontSize: 15, fontWeight: '800', marginBottom: 8 }, item: { backgroundColor: '#FFF', padding: 13, marginBottom: 8, borderRadius: 4 }, itemTop: { flexDirection: 'row', alignItems: 'center' }, productImageWrap: { width: 46, height: 46, borderRadius: 4, overflow: 'hidden', backgroundColor: '#E8F1F6', alignItems: 'center', justifyContent: 'center', marginRight: 10 }, productImage: { width: '100%', height: '100%' }, imagePlaceholder: { color: '#3C8DBC', fontSize: 17, fontWeight: '900' }, itemCopy: { flex: 1 }, productName: { color: '#333', fontSize: 14, fontWeight: '700' }, pack: { color: '#888', fontSize: 10, marginTop: 2 }, itemAmount: { color: '#00A65A', fontSize: 15, fontWeight: '900' }, itemBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#EEE' }, itemMeta: { color: '#777', fontSize: 11 }, strong: { color: '#333', fontWeight: '800' }, total: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#173D2D', padding: 15, marginTop: 5, borderRadius: 4 }, totalLabel: { flex: 1, color: '#FFF', fontWeight: '700' }, totalValue: { color: '#FFF', fontSize: 18, fontWeight: '900' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, muted: { color: '#777', marginTop: 9 }, error: { color: '#A94442', textAlign: 'center' }, empty: { color: '#777', textAlign: 'center', padding: 30 },
});
