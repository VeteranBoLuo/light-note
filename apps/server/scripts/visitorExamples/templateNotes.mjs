// Frozen first format repair. New layouts use the shared bodies through showcaseNotes.mjs.
const p = (text) => `<p>${text}</p>`;
const card = (title, body, wide = false) =>
  `<div class="note-template-card${wide ? ' note-template-card--wide' : ''}"><h2>${title}</h2>${body}</div>`;
const grid = (...cards) => `<div class="note-template-grid">${cards.join('')}</div>`;
const callout = (title, body) => `<div class="note-template-callout"><h2>${title}</h2>${body}</div>`;
const page = (key, eyebrow, title, lead, body) =>
  `<div class="note-template-page note-template-page--${key}"><div class="note-template-hero"><p class="note-template-eyebrow">${eyebrow}</p><h2>${title}</h2><p class="note-template-lead">${lead}</p></div>${body}</div>`;

export const templateNoteBodies = {
  daily: page(
    'daily',
    'DAILY NOTE · 演示第 1 天',
    '用户访谈整理日报',
    '教学演示。对象 A、B、C 均为虚构，不对应真实用户。',
    grid(
      card(
        '今日重点 <span class="note-template-hint">最多 3 件</span>',
        '<ol><li>拆分三段模拟访谈的原话、观察和解释。</li><li>比较资料回找习惯，保留相反证据。</li><li>明确下一轮需要观察的问题。</li></ol>',
      ),
      card(
        '完成与进展',
        p(
          '已整理访谈摘要和编码表。A 能保存资料但回找困难；B 会用关键词搜索；C 习惯按项目整理。现在可以比较不同习惯，而不是笼统地说“大家都找不到”。',
        ),
      ),
    ) +
      grid(
        card(
          '卡点与需要协作',
          p(
            '还没有观察用户真正找回一份旧资料。仅凭访谈回忆，无法判断困难发生在哪一步；需要研究与记录者共同设计观察任务。',
          ),
        ),
        card(
          '今日收获',
          p(
            '把原话与解释分开，才能追溯判断依据。观察来自配套访谈摘要和编码表，样本只用于练习，不能据此推出用户比例或产品收益。',
          ),
        ),
      ) +
      callout(
        '明日第一步',
        p(
          '设计“找回上周的一份资料”任务，记录入口、搜索词和中断点。完成条件：能区分标签理解问题、来源缺失问题和搜索问题。',
        ),
      ),
  ),
  weekly: page(
    'weekly',
    'WEEKLY REVIEW · 演示第 1 周',
    '资料回找研究周报',
    '教学演示。所有访谈与进度均为虚构案例，不代表轻笺真实经营数据。',
    card('本周一句话总结', p('先验证“缺少使用情境导致回找困难”，暂不扩大标签功能。'), true) +
      grid(
        card('本周目标', p('把模拟访谈整理为可追溯的材料，并形成资料回找的验证任务。')),
        card('完成度与状态', p('材料整理已完成，任务观察待开始。模拟材料中存在不同习惯，直接追加功能还缺少证据。')),
      ) +
      card(
        '关键成果、证据与影响',
        '<table class="note-template-table"><thead><tr><th>关键成果</th><th>数据 / 证据</th><th>带来的影响</th></tr></thead><tbody><tr><td>访谈摘要</td><td>分开记录原话与解释</td><td>可以追溯判断依据</td></tr><tr><td>编码表</td><td>每段原话都有主题与问题</td><td>可以比较异同</td></tr><tr><td>验证任务</td><td>从保存到找回的连续任务</td><td>检验问题发生位置</td></tr></tbody></table>',
        true,
      ) +
      grid(
        card(
          '问题、风险与需要协作',
          p('模拟访谈不能支持真实产品决策。进入实际研究前，需要招募合适对象、取得同意并明确资料保留期限。'),
        ),
        card(
          '本周复盘',
          p('继续保留原话与相反证据；调整只凭访谈回忆判断问题的做法。本周不报告虚构增长率或未经测量的效率提升。'),
        ),
      ) +
      callout(
        '下周优先级 <span class="note-template-hint">最多 3 项</span>',
        '<ol><li>执行一次小规模可用性观察。</li><li>保留未符合预期的结果。</li><li>根据证据决定是否继续探索。</li></ol>',
      ),
  ),
  meeting: page(
    'meeting',
    'MEETING NOTES · 演示第 1 周复盘',
    '资料回找研究讨论纪要',
    '教学演示 · 参与角色为研究、设计与记录者，不对应真实人员。',
    grid(
      card('会议目标', p('决定下一轮先增加标签，还是先观察资料回找过程。')),
      card('预期产出', p('确定验证方向、行动分工与完成条件。')),
    ) +
      card(
        '议题与讨论',
        '<h3>议题 1：现有证据能否支持增加标签？</h3>' +
          p('现有模拟访谈只有回忆，缺少操作证据。需要保留顺利完成任务的案例，检验是否存在其他解释。'),
        true,
      ) +
      callout('结论与已确认决策', p('先开展“找回一份旧资料”的任务观察，暂不形成产品发布承诺。')) +
      card(
        '行动项',
        '<table class="note-template-table"><thead><tr><th>事项</th><th>负责人</th><th>截止时间</th><th>状态</th></tr></thead><tbody><tr><td>编写中性任务说明；不提示搜索或标签入口</td><td>研究</td><td>下一轮观察前</td><td>已完成</td></tr><tr><td>制作可记录动作、时间点和原话的观察表</td><td>记录者</td><td>下一轮观察前</td><td>待验证</td></tr><tr><td>整理相反证据，保留顺利完成任务的案例</td><td>设计</td><td>下次讨论前</td><td>待开始</td></tr></tbody></table>',
        true,
      ) +
      card(
        '待确认问题与后续跟进',
        p(
          '参与者在哪一步停下？我们是否把自己的解释写成了原话？下次讨论检查观察记录与相反证据，以记录为依据，不以完成了多少会议为成果。',
        ),
        true,
      ),
  ),
};
