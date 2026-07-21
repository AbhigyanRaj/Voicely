import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { signOutUser } from './auth';

const handleUnauthorized = (error: any) => {
  if (error?.message?.includes('401') || error?.status === 401) {
    console.warn('Unauthorized request, clearing session');
    signOutUser();
    window.location.href = '/';
  }
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
      retry: 1, // Only retry once on failure
      refetchOnWindowFocus: false, // Don't refetch when clicking back to the tab
    },
  },
  queryCache: new QueryCache({
    onError: handleUnauthorized,
  }),
  mutationCache: new MutationCache({
    onError: handleUnauthorized,
  }),
});
