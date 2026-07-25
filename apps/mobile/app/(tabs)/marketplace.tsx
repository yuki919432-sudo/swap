import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  Screen,
  AppText,
  SearchBar,
  Chip,
  ListingCard,
  ListingCardSkeleton,
  EmptyState,
  Button,
  Sheet,
  IconButton,
} from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Listing } from "../../src/domain/models";
import { LISTING_POST_TYPE, ITEM_CONDITION, type ListingPostType, type ItemCondition } from "@swap/types";
import type { MarketplaceSort } from "../../src/data/repositories/types";
import { postTypeEmoji, postTypeLabel, conditionLabel, categoryLabel } from "../../src/lib/labels";

const SORTS: { value: MarketplaceSort; label: string }[] = [
  { value: "recent", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "A–Z" },
];

export default function MarketplaceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const params = useLocalSearchParams<{ postType?: string }>();
  const schoolId = session?.school.id;

  const [search, setSearch] = useState("");
  const [postTypes, setPostTypes] = useState<ListingPostType[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [conditions, setConditions] = useState<ItemCondition[]>([]);
  const [sort, setSort] = useState<MarketplaceSort>("recent");
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Seed the post-type filter from a navigation param (e.g. tapped from Home).
  useEffect(() => {
    const pt = params.postType;
    if (pt && (LISTING_POST_TYPE as readonly string[]).includes(pt)) setPostTypes([pt as ListingPostType]);
  }, [params.postType]);

  const load = useCallback(async () => {
    if (!schoolId) return;
    const result = await repos.marketplace.list({
      schoolId,
      search: search.trim() || undefined,
      postTypes: postTypes.length ? postTypes : undefined,
      categories: categories.length ? categories : undefined,
      conditions: conditions.length ? conditions : undefined,
      sort,
    });
    setListings(result);
    setSavedIds(await repos.saved.list());
    setAllCategories(await repos.marketplace.categoriesForSchool(schoolId));
    setLoading(false);
  }, [repos, schoolId, search, postTypes, categories, conditions, sort]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(load, 220); // brief skeleton + debounce
    return () => clearTimeout(t);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (schoolId) repos.saved.list().then(setSavedIds);
    }, [repos, schoolId]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const onToggleSave = async (id: string) => {
    await repos.saved.toggle(id);
    setSavedIds(await repos.saved.list());
  };

  const activeFilterCount = categories.length + conditions.length + (sort !== "recent" ? 1 : 0);
  const rows = useMemo(() => chunk(listings, 2), [listings]);

  return (
    <Screen scroll refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <AppText variant="title1">Marketplace</AppText>
        <IconButton icon="add" accessibilityLabel="Create listing" tone="accent" onPress={() => router.push("/create")} />
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search listings" />
      </View>

      {/* Post-type filter row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.md }}
      >
        {LISTING_POST_TYPE.map((pt) => (
          <Chip
            key={pt}
            label={postTypeLabel[pt]}
            emoji={postTypeEmoji[pt]}
            selected={postTypes.includes(pt)}
            onPress={() => setPostTypes((prev) => toggle(prev, pt))}
          />
        ))}
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.md }}>
        <AppText variant="caption" color="textMuted">
          {loading ? "Loading…" : `${listings.length} ${listings.length === 1 ? "item" : "items"}`}
        </AppText>
        <Button
          label={activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
          variant="secondary"
          icon="options-outline"
          fullWidth={false}
          onPress={() => setFiltersOpen(true)}
        />
      </View>

      {loading ? (
        <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </View>
      ) : listings.length === 0 ? (
        <EmptyState
          emoji="🧺"
          title="Nothing here yet"
          message="No listings match your search and filters. Try clearing a filter — or be the first to post."
          action={<Button label="Create a listing" icon="add" fullWidth={false} onPress={() => router.push("/create")} />}
        />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {rows.map((row, i) => (
            <View key={i} style={{ flexDirection: "row", gap: theme.spacing.md }}>
              {row.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  onPress={() => router.push(`/listing/${l.id}`)}
                  saved={savedIds.includes(l.id)}
                  onToggleSave={() => onToggleSave(l.id)}
                />
              ))}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      )}

      {/* Filters sheet */}
      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <AppText variant="title3">Filters</AppText>

        <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
          CATEGORY
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {allCategories.map((c) => (
            <Chip key={c} label={categoryLabel(c)} selected={categories.includes(c)} onPress={() => setCategories((p) => toggle(p, c))} />
          ))}
        </View>

        <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.md }}>
          CONDITION
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {ITEM_CONDITION.map((c) => (
            <Chip key={c} label={conditionLabel[c]} selected={conditions.includes(c)} onPress={() => setConditions((p) => toggle(p, c))} />
          ))}
        </View>

        <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.md }}>
          SORT
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {SORTS.map((s) => (
            <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
          <Button
            label="Clear"
            variant="ghost"
            onPress={() => {
              setCategories([]);
              setConditions([]);
              setSort("recent");
            }}
          />
          <Button label="Show results" onPress={() => setFiltersOpen(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
