import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Category, getAllProducts, getCategories, Product, ProductVariant } from '@/services/api';

const PAGE_SIZE = 10;

type ProductEntry = { product: Product; variant?: ProductVariant; rowKey: string };

function ProductRow({ entry, index, categoryNames }: { entry: ProductEntry; index: number; categoryNames: Record<number, string> }) {
  const { product, variant } = entry;
  const stock = Number(variant?.stock || 0);

  return (
    <View style={styles.row}>
      <Text style={[styles.cell, styles.serial]}>{index}</Text>
      <View style={[styles.productCell, styles.productColumn]}>
        <View style={styles.thumb}>
          {product.image_url
            ? <Image source={{ uri: product.image_url }} style={styles.productImage} contentFit="cover" transition={150} />
            : <Text style={styles.thumbText}>{product.product_name.charAt(0).toUpperCase()}</Text>}
        </View>
        <View style={styles.productCopy}>
          <Text style={styles.productName} numberOfLines={1}>{product.product_name}</Text>
          <Text style={styles.productMeta} numberOfLines={1}>{product.brand_name || variant?.attribute_name || '—'}</Text>
        </View>
      </View>
      <Text style={[styles.cell, styles.category]} numberOfLines={2}>{product.category_id ? categoryNames[Number(product.category_id)] || `Category ${product.category_id}` : '—'}</Text>
      <Text style={[styles.cell, styles.quantity]}>{variant?.quantity ?? '—'}</Text>
      <Text style={[styles.cell, styles.unit]} numberOfLines={1}>{variant?.unit || '—'}</Text>
      <View style={styles.statusColumn}><View style={[styles.badge, stock <= 0 && styles.inactiveBadge]}><Text style={[styles.badgeText, stock <= 0 && styles.inactiveText]}>{stock > 0 ? 'Active' : 'Out of stock'}</Text></View></View>
      <View style={styles.actionColumn}><Pressable style={styles.editButton}><Text style={styles.editText}>Edit</Text></Pressable></View>
    </View>
  );
}

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const productData = await getAllProducts({ productName: query, categoryId: selectedCategory });
      setProducts(productData);
      setPage(1);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Products could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [query, selectedCategory]);

  useEffect(() => {
    getCategories().then(setCategoryList).catch(() => setCategoryList([]));
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => { void load(); }, 400);
    return () => clearTimeout(debounce);
  }, [load]);

  const entries = useMemo<ProductEntry[]>(() => products.flatMap((product) => {
    const variants = Object.values(product.attribute || {});
    if (!variants.length) return [{ product, rowKey: `${product.product_id}-default` }];
    return variants.map((variant) => ({ product, variant, rowKey: `${product.product_id}-${variant.id}` }));
  }), [products]);

  const categoryNames = useMemo(() => Object.fromEntries(categoryList.map((category) => [Number(category.id), category.category_name])) as Record<number, string>, [categoryList]);
  const categories = useMemo(() => [...categoryList]
    .filter((category) => category.status === undefined || Number(category.status) === 1)
    .sort((a, b) => a.category_name.localeCompare(b.category_name)), [categoryList]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter(({ product, variant }) => {
      const matchesCategory = selectedCategory === null || Number(product.category_id) === selectedCategory;
      const matchesName = !term || product.product_name.toLowerCase().includes(term) ||
        product.brand_name?.toLowerCase().includes(term) ||
        variant?.attribute_name?.toLowerCase().includes(term);
      return matchesCategory && Boolean(matchesName);
    });
  }, [entries, query, selectedCategory]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const first = filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.heading}><Text style={styles.title}>Product</Text><Text style={styles.breadcrumb}>Dashboard  /  Product</Text></View>
        <Pressable style={styles.addButton}><Text style={styles.addButtonText}>＋ Add Product</Text></Pressable>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelTitleRow}><Text style={styles.panelTitle}>Product List</Text><Text style={styles.total}>{entries.length} variants</Text></View>
        <View style={styles.tools}>
          <Text style={styles.entries}>Show 10 entries</Text>
          <View style={styles.searchBox}><Text style={styles.searchLabel}>Product name:</Text><TextInput value={query} onChangeText={(text) => { setQuery(text); setPage(1); }} style={styles.searchInput} placeholder="Search" placeholderTextColor="#AAA" autoCorrect={false} /></View>
        </View>
        <View style={styles.categoryFilter}>
          <Text style={styles.categoryLabel}>Filter by category</Text>
          <Pressable onPress={() => setCategoryOpen(true)} style={styles.categorySelect}>
            <Text style={styles.categorySelectText}>{selectedCategory === null ? 'All categories' : categoryNames[selectedCategory] || 'Choose category'}</Text>
            <Text style={styles.categoryArrow}>⌄</Text>
          </Pressable>
        </View>

        <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setCategoryOpen(false)}>
            <Pressable style={styles.categoryModal} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.modalTitle}>Choose category</Text>
              <FlatList
                data={[{ id: 0, category_name: 'All categories' }, ...categories]}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => {
                  const categoryId = item.id === 0 ? null : item.id;
                  const active = selectedCategory === categoryId;
                  return <Pressable onPress={() => { setSelectedCategory(categoryId); setPage(1); setCategoryOpen(false); }} style={[styles.categoryOption, active && styles.categoryOptionActive]}><Text style={[styles.categoryOptionText, active && styles.categoryOptionTextActive]}>{item.category_name}</Text>{active && <Text style={styles.check}>✓</Text>}</Pressable>;
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>

        {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#3C8DBC" /><Text style={styles.stateText}>Loading products…</Text></View>
          : error ? <View style={styles.center}><Text style={styles.errorTitle}>Couldn’t load products</Text><Text style={styles.stateText}>{error}</Text><Pressable onPress={() => load()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>
          : <>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.serial]}>#</Text><Text style={[styles.headerCell, styles.productColumn]}>Product</Text><Text style={[styles.headerCell, styles.category]}>Category</Text><Text style={[styles.headerCell, styles.quantity]}>Qty</Text><Text style={[styles.headerCell, styles.unit]}>Unit</Text><Text style={[styles.headerCell, styles.statusColumn]}>Status</Text><Text style={[styles.headerCell, styles.actionColumn]}>Action</Text>
            </View>
            <FlatList data={pageItems} keyExtractor={(item) => item.rowKey} renderItem={({ item, index }) => <ProductRow entry={item} index={first + index} categoryNames={categoryNames} />} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />} ListEmptyComponent={<View style={styles.center}><Text style={styles.stateText}>No matching products found.</Text></View>} />
            <View style={styles.pagination}>
              <Text style={styles.showing}>Showing {first} to {last} of {filtered.length} entries</Text>
              <View style={styles.pageButtons}><Pressable disabled={page === 1} onPress={() => setPage((p) => p - 1)} style={[styles.pageButton, page === 1 && styles.disabled]}><Text style={styles.pageButtonText}>Previous</Text></Pressable><View style={styles.currentPage}><Text style={styles.currentPageText}>{page}</Text></View><Pressable disabled={page === pages} onPress={() => setPage((p) => p + 1)} style={[styles.pageButton, page === pages && styles.disabled]}><Text style={styles.pageButtonText}>Next</Text></Pressable></View>
            </View>
          </>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ECF0F5' },
  topBar: { minHeight: 82, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#D2D6DE' },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, backText: { fontSize: 34, color: '#444' },
  heading: { flex: 1 }, title: { fontSize: 24, color: '#333', fontWeight: '500' }, breadcrumb: { fontSize: 11, color: '#777', marginTop: 3 },
  addButton: { backgroundColor: '#00A65A', borderRadius: 3, paddingHorizontal: 12, paddingVertical: 10 }, addButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  panel: { flex: 1, margin: 14, backgroundColor: '#FFF', borderTopWidth: 3, borderTopColor: '#3C8DBC', borderRadius: 3 },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F4F4F4' }, panelTitle: { color: '#444', fontSize: 17, fontWeight: '600' }, total: { marginLeft: 'auto', fontSize: 11, color: '#999' },
  tools: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }, entries: { fontSize: 11, color: '#555' }, searchBox: { flexDirection: 'row', alignItems: 'center' }, searchLabel: { color: '#555', fontSize: 11, marginRight: 6 }, searchInput: { width: 120, height: 34, borderWidth: 1, borderColor: '#D2D6DE', paddingHorizontal: 8, fontSize: 12, color: '#333' },
  categoryFilter: { paddingHorizontal: 12, paddingBottom: 12 }, categoryLabel: { color: '#555', fontSize: 11, fontWeight: '600', marginBottom: 6 }, categorySelect: { height: 40, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D2D6DE', borderRadius: 3, backgroundColor: '#FFF', paddingHorizontal: 12 }, categorySelectText: { flex: 1, color: '#333', fontSize: 12 }, categoryArrow: { color: '#777', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'center', padding: 24 }, categoryModal: { width: '100%', maxWidth: 430, maxHeight: '72%', alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 6, paddingVertical: 8 }, modalTitle: { color: '#333', fontSize: 17, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EEE' }, categoryOption: { minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F3F3' }, categoryOptionActive: { backgroundColor: '#EAF4F9' }, categoryOptionText: { flex: 1, color: '#444', fontSize: 13 }, categoryOptionTextActive: { color: '#247BA5', fontWeight: '700' }, check: { color: '#3C8DBC', fontSize: 15, fontWeight: '800' },
  tableHeader: { minHeight: 39, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#DDD', paddingHorizontal: 7 }, headerCell: { fontSize: 10, fontWeight: '800', color: '#444', textTransform: 'uppercase' },
  row: { minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }, cell: { color: '#555', fontSize: 11 },
  serial: { width: 25, textAlign: 'center' }, productColumn: { flex: 1.7, minWidth: 110 }, category: { flex: 1.1, minWidth: 76 }, quantity: { flex: 0.45, minWidth: 32, textAlign: 'center' }, unit: { flex: 0.55, minWidth: 40, textAlign: 'center' }, statusColumn: { flex: 0.75, minWidth: 64, alignItems: 'center' }, actionColumn: { flex: 0.55, minWidth: 48, alignItems: 'center' },
  productCell: { flexDirection: 'row', alignItems: 'center' }, thumb: { width: 42, height: 42, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E8F1F6', alignItems: 'center', justifyContent: 'center', marginRight: 8 }, productImage: { width: '100%', height: '100%' }, thumbText: { color: '#3C8DBC', fontWeight: '800' }, productCopy: { flex: 1 }, productName: { color: '#333', fontSize: 12, fontWeight: '700' }, productMeta: { color: '#999', fontSize: 9, marginTop: 3 },
  badge: { backgroundColor: '#DFF0D8', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 2 }, badgeText: { color: '#3C763D', fontSize: 8, fontWeight: '700' }, inactiveBadge: { backgroundColor: '#F2DEDE' }, inactiveText: { color: '#A94442' }, editButton: { backgroundColor: '#3C8DBC', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 2 }, editText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  center: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 25 }, stateText: { color: '#777', fontSize: 12, textAlign: 'center', marginTop: 9 }, errorTitle: { color: '#333', fontSize: 17, fontWeight: '700' }, retry: { marginTop: 15, backgroundColor: '#3C8DBC', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 3 }, retryText: { color: '#FFF', fontWeight: '700' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTopWidth: 1, borderTopColor: '#EEE' }, showing: { color: '#666', fontSize: 10 }, pageButtons: { flexDirection: 'row' }, pageButton: { borderWidth: 1, borderColor: '#DDD', paddingHorizontal: 9, paddingVertical: 7 }, pageButtonText: { color: '#555', fontSize: 9 }, currentPage: { backgroundColor: '#3C8DBC', paddingHorizontal: 10, justifyContent: 'center' }, currentPageText: { color: '#FFF', fontSize: 10 }, disabled: { opacity: 0.4 },
});
