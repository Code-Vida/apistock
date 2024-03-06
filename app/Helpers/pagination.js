"use strict";

function getPaginationInfo(pagination = {}) {
  const MAX_PER_PAGE = 100;
  const page = pagination.page || 1;
  const perPage = pagination.perPage
    ? Math.min(pagination.perPage, MAX_PER_PAGE)
    : 30;

  return { page, perPage };
}

function getPaginationResult(entity) {
  return {
    pagination: {
      total: entity.pages ? entity.pages.total : entity.total,
      lastPage: entity.pages ? entity.pages.lastPage : entity.lastPage,
      page: entity.pages ? entity.pages.page : entity.page,
      perPage: entity.pages ? entity.pages.perPage : entity.perPage,
    },
    nodes: entity ? entity.data : [],
    total: entity ? entity.total : [],
  };
}

module.exports = { getPaginationInfo, getPaginationResult };
