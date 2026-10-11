import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Category,
  RelatedSystem,
  SortDir,
  SortField,
  TicketListItem,
  getCategories,
  getRelatedSystems,
  getTickets,
} from "../api.js";
import { PriorityBadge, StatusBadge, statusLabel } from "../components/Badges.js";
import { INVALID_LINK_NOTICE, ParamSpec, isPositiveInt, parseFilterParams, useUrlFilterSync } from "../urlFilters.js";

// Issue 2-5 (Lab 2) — My Tickets: search/filter/sort/pagination over the current Requester's
// own tickets. docs/lab-02/ui-spec.md §5, docs/lab-02/specification.md BR-13/BR-14/BR-15/BR-16/
// BR-17/BR-36/BR-37.
const PAGE_SIZES = [10, 25, 50];
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Ticket Date" },
  { value: "ticketNumber", label: "Ticket Number" },
  { value: "currentStatus", label: "Current Status" },
  { value: "requestedPriority", label: "Requested Priority" },
  { value: "updatedAt", label: "Last Updated" }, // Issue 4-5 (Lab 4) — Requester Dashboard drill-down
];

// Issue 4-5 (Lab 4) — filters, sort and page live in the URL (ui-spec.md §4, FR-16) so the Requester
// Dashboard's links (e.g. /tickets?statusGroup=open) open pre-filtered. The Status filter used to
// offer only "New" (Lab 2, when that was the only reachable status); it now lists all 8 plus
// "All open" (statusGroup=open).
const STATUS_OPTIONS = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED", "REOPENED"];
const OPEN_GROUP = "group:open";
const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const MY_TICKETS_PARAMS: ParamSpec = {
  search: {},
  statusGroup: { allowed: ["open"] },
  currentStatus: { allowed: STATUS_OPTIONS },
  requestedPriority: { allowed: PRIORITY_VALUES },
  categoryId: { test: isPositiveInt },
  relatedSystemId: { test: isPositiveInt },
  sortBy: { allowed: SORT_OPTIONS.map((o) => o.value) },
  sortDir: { allowed: ["asc", "desc"] },
  page: { test: isPositiveInt },
  pageSize: { allowed: ["10", "25", "50"] },
};

type RefDataState = "loading" | "ready" | "failure";
type ListState = "loading" | "ready" | "failure";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function MyTicketsPage() {
  const [searchParams] = useSearchParams();
  const [initial] = useState(() => parseFilterParams(searchParams, MY_TICKETS_PARAMS));
  const init = initial.values;

  const [refDataState, setRefDataState] = useState<RefDataState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [linkNotice, setLinkNotice] = useState(initial.invalid);

  const [searchInput, setSearchInput] = useState(init.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(init.search ?? "");
  const [categoryFilter, setCategoryFilter] = useState(init.categoryId ?? "");
  const [relatedSystemFilter, setRelatedSystemFilter] = useState(init.relatedSystemId ?? "");
  const [priorityFilter, setPriorityFilter] = useState(init.requestedPriority ?? "");
  const [statusFilter, setStatusFilter] = useState(init.statusGroup ? OPEN_GROUP : init.currentStatus ?? "");
  const [sortBy, setSortBy] = useState<SortField>((init.sortBy as SortField) ?? "createdAt");
  const [sortDir, setSortDir] = useState<SortDir>((init.sortDir as SortDir) ?? "desc");
  const [page, setPage] = useState(init.page ? Number(init.page) : 1);
  const [pageSize, setPageSize] = useState(init.pageSize ? Number(init.pageSize) : 10);

  // Same "keep the URL's page" rule as the Ticket Queue: only a filter set that didn't come from the
  // URL resets to page 1.
  const filterKey = [debouncedSearch, categoryFilter, relatedSystemFilter, priorityFilter, statusFilter, sortBy, sortDir, pageSize].join("|");
  const urlFilterKey = useRef<string | null>(filterKey);

  function applyFromUrl(values: Record<string, string>, invalid: boolean) {
    urlFilterKey.current = [
      values.search ?? "",
      values.categoryId ?? "",
      values.relatedSystemId ?? "",
      values.requestedPriority ?? "",
      values.statusGroup ? OPEN_GROUP : values.currentStatus ?? "",
      values.sortBy ?? "createdAt",
      values.sortDir ?? "desc",
      values.pageSize ? Number(values.pageSize) : 10,
    ].join("|");
    setSearchInput(values.search ?? "");
    setDebouncedSearch(values.search ?? "");
    setCategoryFilter(values.categoryId ?? "");
    setRelatedSystemFilter(values.relatedSystemId ?? "");
    setPriorityFilter(values.requestedPriority ?? "");
    setStatusFilter(values.statusGroup ? OPEN_GROUP : values.currentStatus ?? "");
    setSortBy((values.sortBy as SortField) ?? "createdAt");
    setSortDir((values.sortDir as SortDir) ?? "desc");
    setPage(values.page ? Number(values.page) : 1);
    setPageSize(values.pageSize ? Number(values.pageSize) : 10);
    setLinkNotice(invalid);
  }

  useUrlFilterSync(
    {
      search: debouncedSearch,
      statusGroup: statusFilter === OPEN_GROUP ? "open" : "",
      currentStatus: statusFilter === OPEN_GROUP ? "" : statusFilter,
      requestedPriority: priorityFilter,
      categoryId: categoryFilter,
      relatedSystemId: relatedSystemFilter,
      sortBy: sortBy === "createdAt" ? "" : sortBy,
      sortDir: sortDir === "desc" ? "" : sortDir,
      page: page > 1 ? String(page) : "",
      pageSize: pageSize === 10 ? "" : String(pageSize),
    },
    MY_TICKETS_PARAMS,
    applyFromUrl
  );

  const [listState, setListState] = useState<ListState>("loading");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);

  // Debounce the search box (ui-spec.md §5.3) so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset to page 1 whenever the effective query (not the page itself) changes — unless the URL set it.
  useEffect(() => {
    if (filterKey === urlFilterKey.current) return;
    urlFilterKey.current = null;
    setPage(1);
  }, [filterKey]);

  async function loadReferenceData() {
    setRefDataState("loading");
    try {
      const [categoryList, relatedSystemList] = await Promise.all([getCategories(), getRelatedSystems()]);
      setCategories(categoryList);
      setRelatedSystems(relatedSystemList);
      setRefDataState("ready");
    } catch {
      setRefDataState("failure");
    }
  }

  useEffect(() => {
    loadReferenceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTickets() {
    setListState("loading");
    try {
      const result = await getTickets({
        search: debouncedSearch || undefined,
        categoryId: categoryFilter ? Number(categoryFilter) : undefined,
        relatedSystemId: relatedSystemFilter ? Number(relatedSystemFilter) : undefined,
        requestedPriority: priorityFilter ? (priorityFilter as never) : undefined,
        currentStatus: statusFilter && statusFilter !== OPEN_GROUP ? statusFilter : undefined,
        statusGroup: statusFilter === OPEN_GROUP ? "open" : undefined,
        sortBy,
        sortDir,
        page,
        pageSize,
      });
      setTickets(result.data);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);
      setListState("ready");
    } catch {
      setListState("failure");
    }
  }

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryFilter, relatedSystemFilter, priorityFilter, statusFilter, sortBy, sortDir, page, pageSize]);

  const hasActiveFilters = Boolean(
    debouncedSearch || categoryFilter || relatedSystemFilter || priorityFilter || statusFilter
  );

  function clearFilters() {
    setSearchInput("");
    setCategoryFilter("");
    setRelatedSystemFilter("");
    setPriorityFilter("");
    setStatusFilter("");
    setLinkNotice(false);
  }

  const filterSummary = [
    debouncedSearch ? `"${debouncedSearch}"` : "",
    statusFilter === OPEN_GROUP ? "All open" : statusFilter ? statusLabel(statusFilter) : "",
    priorityFilter ? `Priority ${priorityFilter.toLowerCase()}` : "",
    categoryFilter ? categories.find((c) => String(c.id) === categoryFilter)?.name ?? "Category" : "",
    relatedSystemFilter ? relatedSystems.find((r) => String(r.id) === relatedSystemFilter)?.name ?? "Related system" : "",
  ].filter(Boolean);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 mb-0">My Tickets</h1>
        <Link to="/tickets/new" className="btn btn-zg-primary">
          Create Ticket
        </Link>
      </div>

      {linkNotice && (
        <div className="alert alert-info py-2 small" role="status">
          {INVALID_LINK_NOTICE}
        </div>
      )}

      {refDataState === "failure" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">Unable to load filter options. Try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={loadReferenceData}>
            Retry
          </button>
        </div>
      )}

      {/* Toolbar: search, filters, sort */}
      <div className="row g-2 mb-3 align-items-end">
        <div className="col-md-3">
          <label htmlFor="search" className="form-label small fw-semibold">
            Search
          </label>
          <input
            id="search"
            type="text"
            className="form-control"
            placeholder="Ticket number or summary"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="filter-category" className="form-label small fw-semibold">
            Category
          </label>
          <select
            id="filter-category"
            className="form-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="filter-system" className="form-label small fw-semibold">
            Related System
          </label>
          <select
            id="filter-system"
            className="form-select"
            value={relatedSystemFilter}
            onChange={(e) => setRelatedSystemFilter(e.target.value)}
          >
            <option value="">All</option>
            {relatedSystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="filter-priority" className="form-label small fw-semibold">
            Priority
          </label>
          <select
            id="filter-priority"
            className="form-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="filter-status" className="form-label small fw-semibold">
            Status
          </label>
          <select
            id="filter-status"
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value={OPEN_GROUP}>All open</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {statusLabel(st)}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters && (
          <div className="col-12 d-flex flex-wrap align-items-center gap-2">
            <span className="small text-muted">Showing: {filterSummary.join(" · ")}</span>
            <button type="button" className="btn btn-link p-0" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="row g-2 mb-3 align-items-end">
        <div className="col-6 col-md-3">
          <label htmlFor="sort-by" className="form-label small fw-semibold">
            Sort by
          </label>
          <select
            id="sort-by"
            className="form-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="sort-dir" className="form-label small fw-semibold">
            Direction
          </label>
          <select
            id="sort-dir"
            className="form-select"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>

      {/* List area */}
      {listState === "loading" && <p className="text-muted">Loading tickets…</p>}

      {listState === "failure" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">Unable to load your tickets. Try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={loadTickets}>
            Retry
          </button>
        </div>
      )}

      {listState === "ready" && tickets.length === 0 && !hasActiveFilters && (
        <div className="alert alert-info" role="status">
          <p className="mb-2">You haven't created any tickets yet.</p>
          <Link to="/tickets/new" className="btn btn-zg-primary btn-sm">
            Create Ticket
          </Link>
        </div>
      )}

      {listState === "ready" && tickets.length === 0 && hasActiveFilters && (
        <div className="alert alert-warning" role="status">
          <p className="mb-2">No tickets match your filters.</p>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {listState === "ready" && tickets.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col">Related System</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`}>{t.ticketNumber}</Link>
                    </td>
                    <td>{t.summary}</td>
                    <td>{t.categoryName}</td>
                    <td>{t.relatedSystemName}</td>
                    <td>
                      <PriorityBadge priority={t.requestedPriority} />
                    </td>
                    <td>
                      <StatusBadge status={t.currentStatus} />
                    </td>
                    <td>{formatDate(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none">
            {tickets.map((t) => (
              <div className="ticket-card" key={t.id}>
                <div className="d-flex justify-content-between align-items-start mb-1">
                  <Link to={`/tickets/${t.id}`} className="fw-semibold">
                    {t.ticketNumber}
                  </Link>
                  <StatusBadge status={t.currentStatus} />
                </div>
                <p className="mb-2">{t.summary}</p>
                <div className="small text-muted mb-1">
                  {t.categoryName} · {t.relatedSystemName}
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <PriorityBadge priority={t.requestedPriority} />
                  <span className="small text-muted">{formatDate(t.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="d-flex flex-wrap justify-content-between align-items-center mt-3 gap-2">
            <div className="d-flex align-items-center gap-2">
              <label htmlFor="page-size" className="small fw-semibold mb-0">
                Page size
              </label>
              <select
                id="page-size"
                className="form-select form-select-sm w-auto"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="small text-muted">{totalItems} total</span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={!hasPreviousPage}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="small">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={!hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
