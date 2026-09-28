'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { reportClientError } from '@/components/common/error-fallback';

/**
 * 레이아웃 부가 부품(헤더·범위 스위처·하단 탭바)용 클래스형 ErrorBoundary (P34-B).
 * 감싼 부품의 **클라이언트 렌더 오류**가 페이지 전체를 죽이지 않게 하고, 실패 시 아무것도 그리지 않는다(기본)
 * 또는 `fallback` 을 그린다. `componentDidCatch` 에서 `/api/client-error` 로 보고한다(scope = `slot:{name}`).
 *
 * ⚠ 서버 컴포넌트의 RSC 직렬화 오류(2026-09-28 장애 유형 — "Functions cannot be passed directly to Client Components")나
 *   서버 렌더 중 throw 는 이 경계가 받지 못한다. 그것은 해당 세그먼트의 error.tsx(레이아웃 자체 오류는 상위 error.tsx)가 받는다.
 *   서버 컴포넌트 children 을 감싸도 무해하며(RSC payload 로 전달), 클라이언트 하이드레이션·이벤트 렌더 오류만 잡는다.
 */
interface SafeSlotProps {
  /** 보고 범위 식별자 (예: 'header', 'scope-switcher', 'mobile-tabs') */
  name: string;
  /** 실패 시 대신 그릴 내용 (기본 null = 아무것도 그리지 않음). 직렬화 가능한 값만(문자열·JSX). */
  fallback?: ReactNode;
  children: ReactNode;
}

interface SafeSlotState {
  failed: boolean;
}

export class SafeSlot extends Component<SafeSlotProps, SafeSlotState> {
  state: SafeSlotState = { failed: false };

  static getDerivedStateFromError(): SafeSlotState {
    return { failed: true };
  }

  componentDidCatch(error: Error & { digest?: string }, info: ErrorInfo): void {
    reportClientError({
      digest: error.digest ?? null,
      message: `${error.message}${info.componentStack ? ` @${info.componentStack.split('\n').find((l) => l.trim())?.trim() ?? ''}` : ''}`,
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      scope: `slot:${this.props.name}`,
    });
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
