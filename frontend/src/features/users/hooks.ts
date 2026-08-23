import { useAsyncResource } from '../../shared/hooks/useAsyncResource';
import type { Page } from '../../shared/api/types';
import type { User } from '../auth/types';
import { fetchUsersRequest } from './api';

const EMPTY_PAGE: Page<User> = { items: [], total: 0, page: 1, page_size: 20 };

export function useUsersList(page: number, pageSize: number, pendingOnly: boolean) {
  return useAsyncResource(
    () => fetchUsersRequest(page, pageSize, pendingOnly),
    [page, pageSize, pendingOnly],
    EMPTY_PAGE,
  );
}
