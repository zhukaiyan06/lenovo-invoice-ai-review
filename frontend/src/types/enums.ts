export enum Role {
  L2 = 'L2',
  Auditor = 'AUDITOR',
  Supervisor = 'SUPERVISOR'
}

export enum ReportStatus {
  PendingL2Confirm = '待 L2 确认',
  PendingReviewNormal = '待人工审批-正常',
  PendingReviewAnomaly = '待人工审批-异常',
  ApprovedLocked = '已锁定 / 审核归档',
  Rejected = '已驳回',
  Withdrawn = '已撤回'
}

export enum AiLabel {
  Normal = '正常',
  Anomaly = '异常',
  Pending = '未打标'
}

export enum AnomalyCode {
  DuplicateInvoice = 'DUPLICATE_INVOICE',
  KeyFieldModified = 'KEY_FIELD_MODIFIED',
  OcrFailed = 'OCR_FAILED',
  OcrBuyerCodeNotRecognizedManualFilled = 'OCR_BUYER_CODE_NOT_RECOGNIZED_MANUAL_FILLED',
  OcrSellerCodeNotRecognizedManualFilled = 'OCR_SELLER_CODE_NOT_RECOGNIZED_MANUAL_FILLED',
  OcrCodeManualFilled = 'OCR_CODE_MANUAL_FILLED'
}
