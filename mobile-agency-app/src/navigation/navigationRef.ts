import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

type DeepLinkRoute = { tab: string; screen?: string; params?: Record<string, unknown> };

export function navigateDeepLink(route: DeepLinkRoute) {
  if (!navigationRef.isReady()) return;
  if (route.screen) {
    navigationRef.navigate(route.tab as never, { screen: route.screen, params: route.params } as never);
  } else {
    navigationRef.navigate(route.tab as never);
  }
}
