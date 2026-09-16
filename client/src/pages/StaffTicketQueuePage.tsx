import { useEffect, useState } from "react";
import { Category, SortDir, StaffSortField, StaffTicketListItem, getCategories, getStaffTickets } from "../api.js";
import { PriorityBadge, StatusBadge, RoleBadge } from "../components/Badges.js";

// Issue 3-4 (Lab 3) — the Staff Ticket Queue: search/filter/sort/pagination over every Ticket,
// regardless of Requester. docs/lab-03/ui-spec.md §6, specification.md FR-10/FR-11, AC-16/AC-18/AC-19.
// Read-only: no claim/reassign/priority/notes here — see Issue 3-5's Staff Ticket Detail for those.
const PAGE_SIZES = [10, 25, 50];
const SORT_OPTIONS: { value: StaffSortField; label: string }[] = [
  { value: "createdAt", label: "Created Date" },
  { value: "currentStatus", label: "Current Status" },
  { value: "itPriority", label: "IT Priority" },
  { value: "updatedAt", label: "Last Updated" },
];
// api-spec.md §7: the full 8-value enum, but only these are reachable through the app today —
// OPEN/WAITING_FOR_REQUESTER exist in the schema (Issue 3-4's enum extension) yet nothing produces
// them until Issue 3-5's transition endpoint. Listed anyway so the filter is honest about what the
// backend already accepts, rather than hiding options that will start working once 3-5 ships.
const STATUS_OPTIONS = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED", "REOPENED"];

type RefDataState = "loading" | "ready" | "failure";
type ListState = "loading" | "ready" | "failure";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function StaffTicketQueuePage() {
  const [refDataState, setRefDataState] = useState<RefDataState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [itPriorityFilter, setItPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Simple two-option filter (All / Unassigned) rather than a per-owner picker: nothing can set an
  // owner until Issue 3-5 exists, so every Ticket is unassigned for this issue's entire lifespan —
  // a "filter by specific staff member" control would have nothing to filter by yet.
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortBy, setSortBy] = useState<StaffSortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [listState, setListState] = useState<ListState>("loading");
  const [tickets, setTickets] = useState<StaffTicketListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryFilter, priorityFilter, itPriorityFilter, statusFilter, ownerFilter, sortBy, sortDir, pageSize]);

  async function loadReferenceData() {
    setRefDataState("loading");
    try {
      setCategories(await getCategories());
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
      const result = await getStaffTickets({
        search: debouncedSearch || undefined,
        categoryId: categoryFilter ? Number(categoryFilter) : undefined,
        requestedPriority: priorityFilter ? (priorityFilter as never) : undefined,
        itPriority: itPriorityFilter ? (itPriorityFilter as never) : undefined,
        currentStatus: statusFilter || undefined,
        ownerId: ownerFilter === "unassigned" ? "unassigned" : undefined,
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
  }, [debouncedSearch, categoryFilter, priorityFilter, itPriorityFilter, statusFilter, ownerFilter, sortBy, sortDir, page, pageSize]);

  const hasActiveFilters = Boolean(
    debouncedSearch || categoryFilter || priorityFilter || itPriorityFilter || statusFilter || ownerFilter
  );

  function clearFilters() {
    setSearchInput("");
    setCategoryFilter("");
    setPriorityFilter("");
    setItPriorityFilter("");
    setStatusFilter("");
    setOwnerFilter("");
  }

  return (
    <div>
      <h1 className="h4 mb-4">Ticket Queue</h1>

      {refDataState === "failure" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">Unable to load filter options. Try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={loadReferenceData}>
            Retry
          </button>
        </div>
      )}

      {/* Toolbar: search, filters */}
      <div className="row g-2 mb-3 align-items-end">
        <div className="col-md-3">
          <label htmlFor="queue-search" className="form-label small fw-semibold">
            Search
          </label>
          <input
            id="queue-search"
            type="text"
            className="form-control"
            placeholder="Ticket number or summary"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="queue-filter-category" className="form-label small fw-semibold">
            Category
          </label>
          <select
            id="queue-filter-category"
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
          <label htmlFor="queue-filter-status" className="form-label small fw-semibold">
            Status
          </label>
          <select
            id="queue-filter-status"
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="queue-filter-priority" className="form-label small fw-semibold">
            Requested Priority
          </label>
          <select
            id="queue-filter-priority"
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
          <label htmlFor="queue-filter-it-priority" className="form-label small fw-semibold">
            IT Priority
          </label>
          <select
            id="queue-filter-it-priority"
            className="form-select"
            value={itPriorityFilter}
            onChange={(e) => setItPriorityFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="queue-filter-owner" className="form-label small fw-semibold">
            Ticket Owner
          </label>
          <select
            id="queue-filter-owner"
            className="form-select"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        {hasActiveFilters && (
          <div className="col-12">
            <button type="button" className="btn btn-link p-0" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="row g-2 mb-3 align-items-end">
        <div className="col-6 col-md-3">
          <label htmlFor="queue-sort-by" className="form-label small fw-semibold">
            Sort by
          </label>
          <select
            id="queue-sort-by"
            className="form-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as StaffSortField)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="queue-sort-dir" className="form-label small fw-semibold">
            Direction
          </label>
          <select
            id="queue-sort-dir"
            className="form-select"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>

      {listState === "loading" && <p className="text-muted">Loading queue…</p>}

      {listState === "failure" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">Unable to load the ticket queue. Try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={loadTickets}>
            Retry
          </button>
        </div>
      )}

      {listState === "ready" && tickets.length === 0 && !hasActiveFilters && (
        <div className="alert alert-info" role="status">
          No tickets in the queue yet.
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
                  <th scope="col">Created Date</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Requested Priority</th>
                  <th scope="col">IT Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ticket Owner</th>
                  <th scope="col">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.ticketNumber}</td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.summary}</td>
                    <td>
                      <PriorityBadge priority={t.requestedPriority} />
                    </td>
                    <td>
                      <PriorityBadge priority={t.itPriority} />
                    </td>
                    <td>
                      <StatusBadge status={t.currentStatus} />
                    </td>
                    <td>
                      {t.owner ? (
                        <span className="d-flex align-items-center gap-1">
                          {t.owner.name} <RoleBadge role={t.owner.role} />
                        </span>
                      ) : (
                        <span className="text-muted">Unassigned</span>
                      )}
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
                  <span className="fw-semibold">{t.ticketNumber}</span>
                  <StatusBadge status={t.currentStatus} />
                </div>
                <p className="mb-2">{t.summary}</p>
                <div className="small text-muted mb-1">Requested by {t.requesterName}</div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <PriorityBadge priority={t.itPriority} />
                  <span className="small text-muted">{formatDate(t.updatedAt)}</span>
                </div>
                <div className="small">
                  {t.owner ? (
                    <span className="d-flex align-items-center gap-1">
                      {t.owner.name} <RoleBadge role={t.owner.role} />
                    </span>
                  ) : (
                    <span className="text-muted">Unassigned</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="d-flex flex-wrap justify-content-between align-items-center mt-3 gap-2">
            <div className="d-flex align-items-center gap-2">
              <label htmlFor="queue-page-size" className="small fw-semibold mb-0">
                Page size
              </label>
              <select
                id="queue-page-size"
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
