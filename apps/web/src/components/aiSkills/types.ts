export interface AiSkillPanelAction {
  id: string;
  label: string;
  skillId?: string;
  input?: Record<string, unknown>;
  promptKey?: string;
  promptValue?: string;
  disabled?: boolean;
  reason?: string;
}
