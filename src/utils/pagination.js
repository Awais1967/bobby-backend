function getPagination(query = {}, options = {}) {
  const maxPageSize = options.maxPageSize || 100;
  const defaultPageSize = options.defaultPageSize || 10;
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const requestedPageSize = Number.parseInt(query.pageSize, 10) || defaultPageSize;
  const pageSize = Math.min(Math.max(requestedPageSize, 1), maxPageSize);
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip, limit: pageSize };
}

function buildPaginationResponse(items, total, page, pageSize) {
  return {
    items,
    total,
    page,
    pageSize,
  };
}

module.exports = {
  buildPaginationResponse,
  getPagination,
};
