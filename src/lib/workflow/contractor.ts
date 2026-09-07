/**
 * 업로드 파일 표현 타입. (지급증빙 등 서버측 파일 수집·검증 공용)
 * 구 공사업체 등록 워크플로우(submitContractorRegistration)는 지원신청(사전) 신청단위
 * 시스템으로 일원화되면서 제거되었고, 이 타입만 upload-validation·payment 에서 재사용된다.
 */
export interface UploadedDoc {
  buffer: Buffer;
  mimeType: string;
  ext: string;
}
