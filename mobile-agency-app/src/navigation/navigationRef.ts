import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();

type DeepLinkRoute = { tab: string; screen?: string; params?: Record<string, unknown> };

export function navigateDeepLink(route: DeepLinkRoute) {
  if (!navigationRef.isReady()) return;
  if (route.screen) {
    navigationRef.navigate(route.tab, { screen: route.screen, params: route.params });
  } else {
    navigationRef.navigate(route.tab);
  }
}
