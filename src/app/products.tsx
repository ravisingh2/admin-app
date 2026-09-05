import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Category, getAuthenticatedRoleId, getCategories, getMerchantMappingData, getProductListFilters, getProductListScrollOffset, getProductPage, MerchantOption, Product, ProductVariant, saveProductMerchantMapping, selectProductForEdit, setProductListFilters, setProductListScrollOffset } from '@/services/api';

const PAGE_SIZE = 10;

type ProductEntry = { product: Product; variant?: ProductVariant; rowKey: string };

function ProductRow({ entry, index, categoryNames, onEdit, onMapMerchant, mappedCount, merchant }: { entry: ProductEntry; index: number; categoryNames: Record<number, string>; onEdit: (product: Product, variant?: ProductVariant) => void; onMapMerchant: (product: Product) => void; mappedCount: number; merchant: boolean }) {
  const { product, variant } = entry;
  const isActive = Number(variant?.status ?? product.status ?? 1) === 1;

  if (merchant) return (
    <View style={styles.merchantCard}>
      <View style={styles.merchantImageWrap}>{product.image_url ? <Image source={{ uri: product.image_url }} style={styles.productImage} contentFit="cover" transition={150} /> : <Text style={styles.merchantImageText}>{product.product_name.charAt(0).toUpperCase()}</Text>}</View>
      <View style={styles.merchantCopy}><Text style={styles.merchantProductName} numberOfLines={1}>{product.product_name}</Text><Text style={styles.merchantAttribute} numberOfLines={1}>{variant?.attribute_name || 'Standard item'}</Text><Text style={styles.merchantCategory} numberOfLines={1}>{product.category_id ? categoryNames[Number(product.category_id)] || `Category ${product.category_id}` : 'Uncategorised'}</Text></View>
      <View style={styles.merchantNumbers}><View style={styles.pricePill}><Text style={styles.pillLabel}>PRICE</Text><Text style={styles.priceValue}>{variant?.actual_price || (variant ? variant.price : product.price) || '—'}</Text></View><View style={[styles.stockPill, Number(variant?.stock || 0) <= 0 && styles.stockPillEmpty]}><Text style={styles.pillLabel}>STOCK</Text><Text style={[styles.stockValue, Number(variant?.stock || 0) <= 0 && styles.stockValueEmpty]}>{variant?.stock ?? '—'}</Text></View></View>
      <Pressable onPress={() => onEdit(product, variant)} style={({ pressed }) => [styles.manageButton, pressed && styles.pressedButton]}><Text style={styles.manageButtonText}>Manage</Text><Text style={styles.manageArrow}>›</Text></Pressable>
    </View>
  );

  return (
    <View style={styles.adminProductCard}>
      <Text style={styles.adminSerial}>{index}</Text>
      <View style={styles.adminProductMain}>
        <View style={styles.thumb}>
          {product.image_url
            ? <Image source={{ uri: product.image_url }} style={styles.productImage} contentFit="cover" transition={150} />
            : <Text style={styles.thumbText}>{product.product_name.charAt(0).toUpperCase()}</Text>}
        </View>
        <View style={styles.productCopy}>
          <Text style={styles.productName} numberOfLines={1}>{product.product_name}</Text>
          <Text style={styles.productMeta} numberOfLines={1}>{variant?.attribute_name || product.brand_name || '—'}</Text>
          <Text style={styles.adminMeta} numberOfLines={1}>{variant?.quantity ?? '—'} {variant?.unit || ''}  ·  {product.category_id ? categoryNames[Number(product.category_id)] || `Category ${product.category_id}` : 'Uncategorised'}</Text>
        </View>
      </View>
      <View style={[styles.badge, !isActive && styles.inactiveBadge]}><Text style={[styles.badgeText, !isActive && styles.inactiveText]}>{isActive ? 'Active' : 'Inactive'}</Text></View>
      <View style={styles.adminActions}><Pressable accessibilityRole="button" accessibilityLabel={`Map ${product.product_name} with merchants`} hitSlop={4} onPress={() => onMapMerchant(product)} style={({ pressed }) => [styles.mapButton, pressed && styles.actionPressed]}><Text style={styles.mapButtonIcon}>⇄</Text><Text style={styles.mapButtonText}>Map{mappedCount ? ` (${mappedCount})` : ''}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${product.product_name}`} hitSlop={4} onPress={() => onEdit(product, variant)} style={({ pressed }) => [styles.editButton, styles.adminEditButton, pressed && styles.actionPressed]}><Text style={styles.editIcon}>✎</Text><Text style={styles.editText}>Edit</Text></Pressable></View>
    </View>
  );
}

export default function ProductsScreen() {
  const isMerchant = getAuthenticatedRoleId() === 2;
  const params = useLocalSearchParams<{ productName?: string; categoryId?: string; refresh?: string }>();
  const savedFilters = getProductListFilters();
  const initialCategoryId = params.categoryId !== undefined
    ? (params.categoryId === '' ? null : Number(params.categoryId))
    : savedFilters.categoryId;
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [query, setQuery] = useState(params.productName ?? savedFilters.productName);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(Number.isFinite(initialCategoryId) ? initialCategoryId : null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [merchantMappings, setMerchantMappings] = useState<Record<number, number[]>>({});
  const [mappingProduct, setMappingProduct] = useState<Product | null>(null);
  const [selectedMerchantIds, setSelectedMerchantIds] = useState<number[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);
  const loadingMoreRef = useRef(false);
  const activeFilterRef = useRef('');
  const scrollReadyRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const productListRef = useRef<FlatList<ProductEntry>>(null);
  const savedScrollOffsetRef = useRef(getProductListScrollOffset());
  const scrollRestoredRef = useRef(savedScrollOffsetRef.current <= 0);
  const previousFilterRef = useRef(`${query.trim()}|${selectedCategory ?? 'all'}`);

  useFocusEffect(useCallback(() => {
    setProducts((current) => [...current]);
  }, []));

  activeFilterRef.current = `${query.trim()}|${selectedCategory ?? 'all'}`;

  useEffect(() => {
    setProductListFilters({ productName: query, categoryId: selectedCategory });
    const filterKey = `${query.trim()}|${selectedCategory ?? 'all'}`;
    if (previousFilterRef.current !== filterKey) {
      previousFilterRef.current = filterKey;
      savedScrollOffsetRef.current = 0;
      scrollRestoredRef.current = true;
      setProductListScrollOffset(0);
      productListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [query, selectedCategory]);

  const loadPage = useCallback(async (pageNumber: number, append: boolean, refresh = false) => {
    if (append && loadingMoreRef.current) return;
    const requestFilter = `${query.trim()}|${selectedCategory ?? 'all'}`;
    if (append) loadingMoreRef.current = true;
    if (refresh) setRefreshing(true);
    else if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const result = await getProductPage({
        productName: query,
        categoryId: selectedCategory,
        categoryName: selectedCategory == null ? undefined : categoryList.find((category) => Number(category.id) === selectedCategory)?.category_name,
        page: pageNumber,
        limit: PAGE_SIZE,
      });
      if (activeFilterRef.current !== requestFilter) return;
      setProducts((current) => {
        const newProducts = append
          ? result.products.filter((item) => !current.some((existing) => existing.product_id === item.product_id))
          : result.products;
        const combined = append ? [...current, ...newProducts] : newProducts;
        const pageAddedProducts = !append || newProducts.length > 0;
        setHasMore(pageAddedProducts && result.products.length >= PAGE_SIZE && combined.length < result.total);
        return combined;
      });
      setNextPage(pageNumber + 1);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Products could not be loaded.'); }
    finally {
      loadingMoreRef.current = false;
      if (activeFilterRef.current === requestFilter) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [query, selectedCategory, categoryList]);

  useEffect(() => {
    getCategories().then(setCategoryList).catch(() => setCategoryList([]));
  }, []);

  useEffect(() => {
    if (isMerchant) return;
    getMerchantMappingData().then(({ merchants: list, mappings }) => { setMerchants(list); setMerchantMappings(mappings); }).catch(() => { setMerchants([]); });
  }, [isMerchant]);

  const openMerchantMapping = (product: Product) => {
    setMappingProduct(product);
    setSelectedMerchantIds([...(merchantMappings[product.product_id] || [])]);
  };

  const saveMerchantMapping = async () => {
    if (!mappingProduct || savingMapping) return;
    try {
      setSavingMapping(true);
      await saveProductMerchantMapping(mappingProduct.product_id, selectedMerchantIds);
      setMerchantMappings((current) => ({ ...current, [mappingProduct.product_id]: [...selectedMerchantIds] }));
      setMappingProduct(null);
      Alert.alert('Mapping saved', 'The selected merchants are now mapped to this product.');
    } catch (reason) {
      Alert.alert('Could not save mapping', reason instanceof Error ? reason.message : 'Please try again.');
    } finally { setSavingMapping(false); }
  };

  useEffect(() => {
    scrollReadyRef.current = false;
    lastScrollYRef.current = 0;
    setHasMore(true);
    const debounce = setTimeout(() => { void loadPage(1, false); }, 400);
    return () => clearTimeout(debounce);
  }, [loadPage, params.refresh]);

  const entries = useMemo<ProductEntry[]>(() => products.flatMap((product) => {
    const variants = Object.values(product.attribute || {});
    if (!variants.length) return [{ product, rowKey: `${product.product_id}-default` }];
    return variants.map((variant) => ({ product, variant, rowKey: `${product.product_id}-${variant.id}` }));
  }), [products, isMerchant]);

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
  const loadNextPage = () => {
    if (!scrollReadyRef.current || !hasMore || loading || loadingMore || refreshing) return;
    scrollReadyRef.current = false;
    void loadPage(nextPage, true);
  };

  const noteUserScroll = (offsetY: number) => {
    if (offsetY > lastScrollYRef.current + 4) scrollReadyRef.current = true;
    lastScrollYRef.current = offsetY;
    setProductListScrollOffset(offsetY);
  };

  const editProduct = (product: Product, variant?: ProductVariant) => {
    selectProductForEdit(product);
    router.push({
      pathname: isMerchant ? '/merchant-inventory' : '/edit-product',
      params: {
        id: product.product_id,
        attributeId: variant ? String(variant.attribute_id || variant.id) : '',
        listProductName: query,
        listCategoryId: selectedCategory == null ? '' : String(selectedCategory),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.topBar, isMerchant && styles.merchantTopBar]}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.heading}><Text style={styles.title}>{isMerchant ? 'Manage Products' : 'Product'}</Text>{!isMerchant && <Text style={styles.breadcrumb}>Dashboard  /  Product</Text>}</View>
        {isMerchant && <Pressable onPress={() => router.navigate('/orders')} style={styles.ordersButton}><Text style={styles.ordersButtonText}>Manage Orders</Text></Pressable>}
        {!isMerchant && <Pressable style={styles.addButton}><Text style={styles.addButtonText}>＋ Add Product</Text></Pressable>}
      </View>

      <View style={[styles.panel, isMerchant && styles.merchantPanel]}>
        {!isMerchant && <View style={styles.adminToolbar}><View style={styles.adminTitleBlock}><Text style={styles.panelTitle}>Product List</Text><Text style={[styles.total, styles.adminTotal]}>{entries.length} variants</Text></View><View style={styles.adminFilters}><TextInput value={query} onChangeText={setQuery} style={styles.adminSearchInput} placeholder="Search product" placeholderTextColor="#8A9991" autoCorrect={false} /><Pressable onPress={() => setCategoryOpen(true)} style={styles.adminCategorySelect}><Text style={styles.adminCategoryText} numberOfLines={1}>{selectedCategory === null ? 'All categories' : categoryNames[selectedCategory] || 'Choose category'}</Text><Text style={styles.categoryArrow}>⌄</Text></Pressable></View></View>}
        <View style={[styles.tools, isMerchant && styles.merchantTools, !isMerchant && styles.adminToolsHidden]}>
          <View style={[styles.searchBox, isMerchant && styles.merchantSearch]}>{!isMerchant && <Text style={styles.searchLabel}>Product name:</Text>}<TextInput value={query} onChangeText={setQuery} style={[styles.searchInput, isMerchant && styles.merchantSearchInput]} placeholder="Search products" placeholderTextColor="#AAA" autoCorrect={false} /></View>
          {isMerchant && <Pressable onPress={() => setCategoryOpen(true)} style={[styles.categorySelect, styles.merchantCategorySelect]}><Text style={styles.categorySelectText}>{selectedCategory === null ? 'All categories' : categoryNames[selectedCategory] || 'Choose category'}</Text><Text style={styles.categoryArrow}>⌄</Text></Pressable>}
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
                  return <Pressable onPress={() => { setSelectedCategory(categoryId); setCategoryOpen(false); }} style={[styles.categoryOption, active && styles.categoryOptionActive]}><Text style={[styles.categoryOptionText, active && styles.categoryOptionTextActive]}>{item.category_name}</Text>{active && <Text style={styles.check}>✓</Text>}</Pressable>;
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={Boolean(mappingProduct)} transparent animationType="fade" onRequestClose={() => !savingMapping && setMappingProduct(null)}>
          <View style={styles.modalOverlay}><View style={styles.mappingModal}><View style={styles.mappingHeader}><View style={styles.mappingHeading}><Text style={styles.modalTitleCompact}>Map merchants</Text><Text style={styles.mappingProductName} numberOfLines={1}>{mappingProduct?.product_name}</Text></View><Pressable disabled={savingMapping} onPress={() => setMappingProduct(null)} style={styles.mappingClose}><Text style={styles.mappingCloseText}>×</Text></Pressable></View><FlatList data={merchants} keyExtractor={(item) => String(item.id)} ListEmptyComponent={<Text style={styles.mappingEmpty}>No merchants available.</Text>} renderItem={({ item }) => { const selected = selectedMerchantIds.includes(item.id); return <Pressable onPress={() => setSelectedMerchantIds((current) => selected ? current.filter((id) => id !== item.id) : [...current, item.id])} style={[styles.merchantOption, selected && styles.merchantOptionSelected]}><View style={[styles.mappingCheck, selected && styles.mappingCheckSelected]}><Text style={styles.mappingCheckText}>{selected ? '✓' : ''}</Text></View><Text style={[styles.merchantOptionText, selected && styles.merchantOptionTextSelected]}>{item.name}</Text></Pressable>; }} /><View style={styles.mappingActions}><Pressable disabled={savingMapping} onPress={() => setMappingProduct(null)} style={styles.mappingCancel}><Text style={styles.mappingCancelText}>Cancel</Text></Pressable><Pressable disabled={savingMapping} onPress={saveMerchantMapping} style={styles.mappingSave}>{savingMapping ? <ActivityIndicator color="#FFF" /> : <Text style={styles.mappingSaveText}>Save mapping</Text>}</Pressable></View></View></View>
        </Modal>

        {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#3C8DBC" /><Text style={styles.stateText}>Loading products…</Text></View>
          : error && products.length === 0 ? <View style={styles.center}><Text style={styles.errorTitle}>Couldn’t load products</Text><Text style={styles.stateText}>{error}</Text><Pressable onPress={() => loadPage(1, false)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>
          : <>
            {!isMerchant && false && <View style={styles.tableHeader}>
              {!isMerchant && <Text style={[styles.headerCell, styles.serial]}>#</Text>}<Text style={[styles.headerCell, styles.productColumn]}>Product / Attribute</Text><Text style={[styles.headerCell, styles.category]}>Category</Text>{isMerchant ? <><Text style={[styles.headerCell, styles.price]}>Price</Text><Text style={[styles.headerCell, styles.stock]}>Stock</Text></> : <><Text style={[styles.headerCell, styles.quantity]}>Qty</Text><Text style={[styles.headerCell, styles.unit]}>Unit</Text><Text style={[styles.headerCell, styles.statusColumn]}>Status</Text></>}<Text style={[styles.headerCell, isMerchant ? styles.merchantAction : styles.actionColumn]}>Action</Text>
            </View>}
            <FlatList
              ref={productListRef}
              data={filtered}
              keyExtractor={(item) => item.rowKey}
              renderItem={({ item, index }) => <ProductRow entry={item} index={index + 1} categoryNames={categoryNames} onEdit={editProduct} onMapMerchant={openMerchantMapping} mappedCount={merchantMappings[item.product.product_id]?.length || 0} merchant={isMerchant} />}
              contentContainerStyle={isMerchant ? styles.merchantList : undefined}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { scrollReadyRef.current = false; void loadPage(1, false, true); }} />}
              ListEmptyComponent={<View style={styles.center}><Text style={styles.stateText}>No matching products found.</Text></View>}
              onScroll={(event) => noteUserScroll(event.nativeEvent.contentOffset.y)}
              onContentSizeChange={() => {
                if (!scrollRestoredRef.current && entries.length > 0) {
                  scrollRestoredRef.current = true;
                  productListRef.current?.scrollToOffset({ offset: savedScrollOffsetRef.current, animated: false });
                }
              }}
              scrollEventThrottle={16}
              onEndReached={loadNextPage}
              onEndReachedThreshold={0.2}
              ListFooterComponent={loadingMore ? <View style={styles.loadingMore}><ActivityIndicator color="#3C8DBC" /><Text style={styles.loadingMoreText}>Loading more products…</Text></View> : !hasMore && filtered.length > 0 ? <Text style={styles.endText}>All products loaded</Text> : null}
            />
          </>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ECF0F5' },
  topBar: { minHeight: 82, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#D2D6DE' },
  merchantTopBar: { minHeight: 58, paddingHorizontal: 10 },
  back: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, backText: { fontSize: 34, color: '#444' },
  heading: { flex: 1 }, title: { fontSize: 24, color: '#333', fontWeight: '500' }, breadcrumb: { fontSize: 11, color: '#777', marginTop: 3 },
  addButton: { backgroundColor: '#00A65A', borderRadius: 3, paddingHorizontal: 12, paddingVertical: 10 }, addButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  ordersButton: { backgroundColor: '#3C8DBC', borderRadius: 3, paddingHorizontal: 11, paddingVertical: 9 }, ordersButtonText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  panel: { flex: 1, margin: 14, backgroundColor: '#FFF', borderTopWidth: 3, borderTopColor: '#3C8DBC', borderRadius: 3 },
  merchantPanel: { margin: 8 },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F4F4F4' }, panelTitle: { color: '#444', fontSize: 17, fontWeight: '600' }, total: { marginLeft: 'auto', fontSize: 11, color: '#999' },
  adminToolbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E8EEEA' }, adminTitleBlock: { minWidth: 80 }, adminTotal: { marginLeft: 0, marginTop: 2 }, adminFilters: { flex: 1, flexDirection: 'row', gap: 7 }, adminSearchInput: { flex: 1, minWidth: 80, height: 38, borderWidth: 1, borderColor: '#D5E1DA', borderRadius: 8, backgroundColor: '#F8FBF9', paddingHorizontal: 9, color: '#333', fontSize: 12 }, adminCategorySelect: { flex: 1, minWidth: 95, height: 38, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D5E1DA', borderRadius: 8, backgroundColor: '#F8FBF9', paddingHorizontal: 9 }, adminCategoryText: { flex: 1, color: '#40534A', fontSize: 11, fontWeight: '600' }, adminToolsHidden: { display: 'none' },
  tools: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 }, entries: { fontSize: 11, color: '#555' }, searchBox: { flexDirection: 'row', alignItems: 'center' }, searchLabel: { color: '#555', fontSize: 11, marginRight: 6 }, searchInput: { width: 120, height: 34, borderWidth: 1, borderColor: '#D2D6DE', paddingHorizontal: 8, fontSize: 12, color: '#333' },
  merchantTools: { gap: 8, paddingVertical: 8 }, merchantSearch: { flex: 1 }, merchantSearchInput: { width: '100%', height: 40 }, merchantCategorySelect: { flex: 1, marginBottom: 0 },
  merchantList: { paddingHorizontal: 8, paddingBottom: 18 }, merchantCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 10, marginBottom: 9, borderWidth: 1, borderColor: '#E3EBE6', shadowColor: '#173D2D', shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, merchantImageWrap: { width: 60, height: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E8F4EC', alignItems: 'center', justifyContent: 'center', marginRight: 10 }, merchantImageText: { color: '#176B45', fontSize: 20, fontWeight: '900' }, merchantCopy: { flex: 1, minWidth: 80 }, merchantProductName: { color: '#173D2D', fontSize: 14, fontWeight: '800' }, merchantAttribute: { color: '#557065', fontSize: 11, fontWeight: '600', marginTop: 3 }, merchantCategory: { color: '#94A29B', fontSize: 9, marginTop: 4 }, merchantNumbers: { gap: 5, marginHorizontal: 7 }, pricePill: { minWidth: 55, backgroundColor: '#E9F6EE', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, alignItems: 'center' }, stockPill: { minWidth: 55, backgroundColor: '#EAF4FA', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, alignItems: 'center' }, stockPillEmpty: { backgroundColor: '#FCEBEC' }, pillLabel: { color: '#8A9A92', fontSize: 7, fontWeight: '900' }, priceValue: { color: '#13824F', fontSize: 12, fontWeight: '900', marginTop: 1 }, stockValue: { color: '#247BA5', fontSize: 12, fontWeight: '900', marginTop: 1 }, stockValueEmpty: { color: '#C94A51' }, manageButton: { height: 38, flexDirection: 'row', alignItems: 'center', backgroundColor: '#176B45', borderRadius: 9, paddingHorizontal: 9 }, pressedButton: { opacity: 0.75 }, manageButtonText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, manageArrow: { color: '#FFF', fontSize: 18, marginLeft: 3 },
  adminProductCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginBottom: 8, padding: 9, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1E9E4', borderRadius: 10 }, adminSerial: { width: 22, color: '#9AA69F', fontSize: 9, textAlign: 'center' }, adminProductMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }, adminMeta: { color: '#7D8C84', fontSize: 9, marginTop: 3 },
  categoryFilter: { paddingHorizontal: 12, paddingBottom: 12 }, categoryLabel: { color: '#555', fontSize: 11, fontWeight: '600', marginBottom: 6 }, categorySelect: { height: 40, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D2D6DE', borderRadius: 3, backgroundColor: '#FFF', paddingHorizontal: 12 }, categorySelectText: { flex: 1, color: '#333', fontSize: 12 }, categoryArrow: { color: '#777', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'center', padding: 24 }, categoryModal: { width: '100%', maxWidth: 430, maxHeight: '72%', alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 6, paddingVertical: 8 }, modalTitle: { color: '#333', fontSize: 17, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EEE' }, categoryOption: { minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F3F3' }, categoryOptionActive: { backgroundColor: '#EAF4F9' }, categoryOptionText: { flex: 1, color: '#444', fontSize: 13 }, categoryOptionTextActive: { color: '#247BA5', fontWeight: '700' }, check: { color: '#3C8DBC', fontSize: 15, fontWeight: '800' },
  tableHeader: { minHeight: 39, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#DDD', paddingHorizontal: 7 }, headerCell: { fontSize: 10, fontWeight: '800', color: '#444', textTransform: 'uppercase' },
  row: { minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }, cell: { color: '#555', fontSize: 11 },
  serial: { width: 25, textAlign: 'center' }, productColumn: { flex: 1.7, minWidth: 110 }, category: { flex: 1.1, minWidth: 76 }, quantity: { flex: 0.45, minWidth: 32, textAlign: 'center' }, unit: { flex: 0.55, minWidth: 40, textAlign: 'center' }, statusColumn: { flex: 0.75, minWidth: 64, alignItems: 'center' }, actionColumn: { flex: 0.7, minWidth: 56, alignItems: 'center', gap: 4 },
  price: { flex: 0.7, minWidth: 52, textAlign: 'center' }, stock: { flex: 0.6, minWidth: 46, textAlign: 'center' }, merchantAction: { width: 110, alignItems: 'center' },
  productCell: { flexDirection: 'row', alignItems: 'center' }, thumb: { width: 42, height: 42, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E8F1F6', alignItems: 'center', justifyContent: 'center', marginRight: 8 }, productImage: { width: '100%', height: '100%' }, thumbText: { color: '#3C8DBC', fontWeight: '800' }, productCopy: { flex: 1 }, productName: { color: '#333', fontSize: 12, fontWeight: '700' }, productMeta: { color: '#999', fontSize: 9, marginTop: 3 },
  badge: { backgroundColor: '#DFF0D8', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 2 }, badgeText: { color: '#3C763D', fontSize: 8, fontWeight: '700' }, inactiveBadge: { backgroundColor: '#F2DEDE' }, inactiveText: { color: '#A94442' }, adminActions: { width: 68, gap: 6, marginLeft: 7 }, mapButton: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F2E9', borderWidth: 1, borderColor: '#73B48E', paddingHorizontal: 7, borderRadius: 8 }, mapButtonIcon: { color: '#176B45', fontSize: 12, fontWeight: '900', marginRight: 3 }, mapButtonText: { color: '#176B45', fontSize: 10, fontWeight: '900' }, editButton: { backgroundColor: '#3C8DBC', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 2 }, adminEditButton: { height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#176B45' }, editIcon: { color: '#FFF', fontSize: 12, fontWeight: '900', marginRight: 4 }, editText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, actionPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  mappingModal: { width: '100%', maxWidth: 430, maxHeight: '76%', alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden' }, mappingHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#E8EEEA' }, mappingHeading: { flex: 1 }, modalTitleCompact: { color: '#173E2D', fontSize: 17, fontWeight: '800' }, mappingProductName: { color: '#77877F', fontSize: 10, marginTop: 2 }, mappingClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#F0F4F2' }, mappingCloseText: { color: '#506159', fontSize: 22, lineHeight: 24 }, merchantOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F0F3F1' }, merchantOptionSelected: { backgroundColor: '#F1F9F4' }, mappingCheck: { width: 21, height: 21, borderWidth: 1.5, borderColor: '#B8C8C0', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, mappingCheckSelected: { backgroundColor: '#176B45', borderColor: '#176B45' }, mappingCheckText: { color: '#FFF', fontSize: 12, fontWeight: '900' }, merchantOptionText: { color: '#4B5C53', fontSize: 13, fontWeight: '600' }, merchantOptionTextSelected: { color: '#176B45', fontWeight: '800' }, mappingEmpty: { color: '#7A8981', textAlign: 'center', padding: 30 }, mappingActions: { flexDirection: 'row', gap: 9, padding: 12, borderTopWidth: 1, borderTopColor: '#E8EEEA' }, mappingCancel: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#EEF2EF' }, mappingCancelText: { color: '#53645B', fontWeight: '800' }, mappingSave: { flex: 1.5, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#176B45' }, mappingSaveText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  center: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 25 }, stateText: { color: '#777', fontSize: 12, textAlign: 'center', marginTop: 9 }, errorTitle: { color: '#333', fontSize: 17, fontWeight: '700' }, retry: { marginTop: 15, backgroundColor: '#3C8DBC', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 3 }, retryText: { color: '#FFF', fontWeight: '700' },
  loadingMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }, loadingMoreText: { color: '#667', fontSize: 11, marginLeft: 9 }, endText: { color: '#999', fontSize: 10, textAlign: 'center', paddingVertical: 17 },
});
