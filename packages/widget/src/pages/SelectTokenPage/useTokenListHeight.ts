import { useTheme } from '@mui/material';
import type { MutableRefObject } from 'react';
import { useLayoutEffect, useState } from 'react';
import { useDefaultElementId } from '../../hooks/useDefaultElementId.js';
import { ElementId, createElementId } from '../../utils/elements.js';

const debounce = (func: Function, timeout = 300) => {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
};

const getContentHeight = (
  elementId: string,
  listParentRef: MutableRefObject<HTMLUListElement | null>,
) => {
  const containerElement = document.getElementById(
    createElementId(ElementId.ScrollableContainer, elementId),
  );

  const headerElement = document.getElementById(
    createElementId(ElementId.Header, elementId),
  );

  const listParentElement = listParentRef?.current;

  let oldHeight;

  // This covers the case where in full height flex mode when the browser height is reduced
  // - this allows the virtualised token list to be made smaller
  if (listParentElement) {
    oldHeight = listParentElement.style.height;
    listParentElement.style.height = '0';
  }

  if (!containerElement || !headerElement) {
    console.warn(
      `Can't find ${ElementId.ScrollableContainer} or ${ElementId.Header} id.`,
    );
    return 0;
  }
  const { height: containerHeight } = containerElement.getBoundingClientRect();
  const { height: headerHeight } = headerElement.getBoundingClientRect();

  // This covers the case where in full height flex mode when the browser height is reduced the
  // - this allows the virtualised token list to be set to minimum size
  if (listParentElement && oldHeight) {
    listParentElement.style.height = oldHeight;
  }

  return containerHeight - headerHeight;
};

interface UseContentHeightProps {
  listParentRef: MutableRefObject<HTMLUListElement | null>;
  headerRef: MutableRefObject<HTMLElement | null>;
}

export const minTokenListHeight = 360;
export const minMobileTokenListHeight = 160;

export const useTokenListHeight = ({
  listParentRef,
  headerRef,
}: UseContentHeightProps) => {
  const elementId = useDefaultElementId();
  const [contentHeight, setContentHeight] = useState<number>(0);
  const theme = useTheme();

  useLayoutEffect(() => {
    const handleResize = () => {
      setContentHeight(getContentHeight(elementId, listParentRef));
    };

    const processResize = debounce(() => handleResize(), 40);

    // calling this on initial mount prevents the lists resizing appearing glitchy
    handleResize();

    const appContainer = document.getElementById(
      createElementId(ElementId.AppExpandedContainer, elementId),
    );

    let resizeObserver: ResizeObserver;
    if (appContainer) {
      resizeObserver = new ResizeObserver(processResize);
      resizeObserver.observe(appContainer);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [elementId, listParentRef]);

  const minListHeight =
    theme.container?.height === '100%'
      ? minMobileTokenListHeight
      : minTokenListHeight;

  const tokenListHeight = Math.max(
    contentHeight - (headerRef.current?.offsetHeight ?? 0),
    minListHeight,
  );

  return {
    minListHeight,
    tokenListHeight,
  };
};
