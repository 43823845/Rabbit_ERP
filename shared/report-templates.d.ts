declare module '../../shared/report-templates.cjs' {
  export interface ReportTemplate {
    report_type: 'profit' | 'balance';
    row_no: number;
    name: string;
    section?: string;
    subject_codes?: string;
    is_total?: number;
    is_header?: number;
    indent_level?: number;
    bold?: number;
    display_order: number;
  }

  export const REPORT_TEMPLATES: ReportTemplate[];
  export function getTemplatesByType(type: 'profit' | 'balance'): ReportTemplate[];
}
