import { describe, expect, it } from 'vitest';
import {
  assessGroundingCapacity,
  buildOutputContractInstruction,
  compileNoteDraftOutputContract,
  requiredMinimumCharacters,
  validateNoteDraftOutput,
} from './outputContract.js';

describe('OutputContract V2', () => {
  it('把 minimum、target range、relative growth、preserve length 编译为可测量契约', () => {
    expect(compileNoteDraftOutputContract({ instruction: '至少 2000 字' }).length).toEqual({
      mode: 'minimum',
      minChars: 2000,
    });
    expect(compileNoteDraftOutputContract({ instruction: '大约 2000 字' }).length).toEqual({
      mode: 'target_range',
      targetMinChars: 1800,
      targetMaxChars: 2300,
    });
    expect(compileNoteDraftOutputContract({ instruction: '控制在 1500～2000 字' }).length).toEqual({
      mode: 'target_range',
      targetMinChars: 1500,
      targetMaxChars: 2000,
    });
    const growth = compileNoteDraftOutputContract({ instruction: '写得更详细', previousContent: '旧'.repeat(800) });
    expect(growth.length).toMatchObject({ mode: 'relative_growth', minGrowthRatio: 0.4, minGrowthChars: 300 });
    expect(requiredMinimumCharacters(growth)).toBe(1120);
    expect(
      compileNoteDraftOutputContract({ instruction: '只润色，不改变长度', previousContent: '旧'.repeat(1200) }).length,
    ).toMatchObject({ mode: 'preserve_length', toleranceRatio: 0.1 });
  });

  it('统一校验长度、结构、Markdown、链接保留和重复段落', () => {
    const previousContent = `旧稿 https://example.com/source\n\n${'事实。'.repeat(100)}`;
    const contract = compileNoteDraftOutputContract({
      instruction: '只润色，不改变长度，分成三段',
      previousContent,
    });
    const invalid = validateNoteDraftOutput({
      content: `<p>${'重复内容。'.repeat(20)}</p>\n\n${'重复内容。'.repeat(20)}\n\n${'重复内容。'.repeat(20)}`,
      contract,
      previousContent,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toEqual(
      expect.arrayContaining(['format_mismatch', 'required_fact_missing', 'repeated_content_padding']),
    );
    expect(buildOutputContractInstruction(contract)).toContain('Markdown');
  });

  it('O-05：明确三段结构少一段也必须失败', () => {
    const contract = compileNoteDraftOutputContract({ instruction: '请分成三段结构' });
    expect(validateNoteDraftOutput({ content: '第一段内容。\n\n第二段内容。', contract }).issues).toContain(
      'required_section_missing',
    );
    expect(validateNoteDraftOutput({ content: '第一段内容。\n\n第二段内容。\n\n第三段内容。', contract }).valid).toBe(
      true,
    );
  });

  it('O-08：仅允许依据材料时，超出可配置支撑容量的长文要求失败关闭', () => {
    const contract = compileNoteDraftOutputContract({ instruction: '仅根据这些材料写至少 5000 字' });
    expect(contract.content.allowGeneralKnowledge).toBe(false);
    expect(assessGroundingCapacity({ contract, sourceChars: 120 })).toMatchObject({
      valid: false,
      requiredMinChars: 5000,
      sourceChars: 120,
    });
    expect(
      assessGroundingCapacity({
        contract,
        sourceChars: 120,
        env: {
          AI_NOTE_DRAFT_MAX_GROUNDED_EXPANSION_RATIO: '40',
          AI_NOTE_DRAFT_GROUNDED_EXPANSION_ALLOWANCE: '5000',
        },
      }).valid,
    ).toBe(true);
  });
});
