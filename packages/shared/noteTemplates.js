// Built-in document bodies shared by the picker, note creation and visitor examples.
// These are trusted product-authored HTML/Markdown, never a renderer for user input.
const p = (text) => `<p>${text}</p>`;
const hint = (text) => `<p class="ln-note-hint">${text}</p>`;
const heading = (text, side = "") =>
  `<div class="ln-note-section-title"><h2>${text}</h2>${side ? `<span>${side}</span>` : ""}</div>`;
const block = (title, body, style = "", side = "") =>
  `<div class="ln-note-block${style ? ` ln-note-${style}` : ""}">${heading(title, side)}${body}</div>`;
const columns = (body, style = "equal") =>
  `<div class="ln-note-${style}-columns">${body}</div>`;
const tasks = (rows) =>
  `<div class="ln-note-tasks">${rows.map(([done, text]) => `<p><input type="checkbox" class="note-todo-checkbox" data-note-task="true"${done ? " checked" : ""}> ${text}</p>`).join("")}</div>`;
const list = (rows) =>
  `<ol>${rows.map((text) => `<li>${text}</li>`).join("")}</ol>`;
const table = (headers, rows) =>
  `<div class="ln-note-table-scroll"><table><thead><tr>${headers.map((text) => `<th>${text}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((text) => `<td>${text}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const head = (title, meta, description = "") =>
  `<div class="ln-note-head"><div><h1>${title}</h1>${description ? p(description) : ""}</div><p class="ln-note-date">${meta}</p></div>`;
const footer = (title, text) =>
  `<p class="ln-note-closing"><strong>${title}</strong>　${text}</p>`;
const section = (title, body) =>
  `<div class="ln-note-reading-section">${heading(title)}${body}</div>`;
const page = (key, body) =>
  `<div class="note-template-page ln-note-layout ln-note-layout--${key}">${body}</div>`;

function renderHtml(key, locale, example) {
  const t = (zh, en) => (locale === "zh-CN" ? zh : en);
  const value = (prompt, sample) => (example ? sample : hint(prompt));
  const date = "{{date}}";
  if (key === "daily") {
    const entries = example
      ? [
          [
            true,
            t("完成项目说明初稿", "Finish the first project brief"),
            t(
              "已补齐目标、范围和分工，等待讨论定稿。相关资料可放在这一项下。",
              "Goals, scope and responsibilities are ready for review. Keep related references with this item.",
            ),
          ],
          [
            true,
            t("整理常用参考资料", "Organize frequently used references"),
            t(
              "合并重复链接，为常用文档补充用途说明。",
              "Merged duplicate links and added a purpose to frequently used documents.",
            ),
          ],
          [
            false,
            t("确认历史方案", "Confirm the earlier proposal"),
            t(
              "已联系资料负责人，等待补充；收到后对照初稿检查遗漏。",
              "Contacted the document owner; awaiting a copy to check the draft for omissions.",
            ),
          ],
        ]
      : [
          [
            false,
            t("事项一：填写具体任务", "Item 1: name a specific task"),
            t(
              "进展：做到哪一步？结果或资料：留下产出或链接。",
              "Progress: where are you now? Outcome or reference: keep the result or a link.",
            ),
          ],
          [
            false,
            t("事项二：填写具体任务", "Item 2: name a specific task"),
            t(
              "补充进展、结果或需要继续跟进的内容。",
              "Add progress, an outcome or anything that needs follow-up.",
            ),
          ],
          [
            false,
            t("事项三：按需添加或删除", "Item 3: add or remove as needed"),
            t(
              "未完成的事项也可以保留，写清下一步。",
              "Keep unfinished work here too, with a clear next step.",
            ),
          ],
        ];
    const today = entries
      .map(
        ([done, title, detail]) =>
          `<div class="ln-note-entry">${tasks([[done, `<strong>${title}</strong>`]])}<p class="ln-note-task-detail${example ? "" : " ln-note-hint"}">${detail}</p></div>`,
      )
      .join("");
    return page(
      key,
      head(t("今天的工作", "Today's work"), `${date} · {{weekday}}`) +
        block(
          t("今日事项", "Today's tasks"),
          today,
          "focus",
          t("逐项记录 · 完成后勾选", "Track each item · check when done"),
        ) +
        columns(
          block(
            t("明日计划", "Tomorrow's plan"),
            tasks(
              example
                ? [
                    [
                      false,
                      t(
                        "补上历史方案，对照检查遗漏",
                        "Compare the earlier proposal and check for omissions",
                      ),
                    ],
                    [
                      false,
                      t(
                        "把讨论问题提前发给参会人",
                        "Send discussion questions to the participants",
                      ),
                    ],
                  ]
                : [
                    [
                      false,
                      t("优先推进的一件事", "The first thing to move forward"),
                    ],
                    [false, t("需要接着跟进的事项", "An item to follow up")],
                  ],
            ),
          ) +
            block(
              t("问题与协作", "Blockers & support"),
              example
                ? p(
                    t(
                      "<strong>问题：</strong>历史资料尚未补齐。",
                      "<strong>Blocker:</strong> The earlier proposal is still missing.",
                    ),
                  ) +
                    p(
                      t(
                        "<strong>协作：</strong>请资料负责人补充来源。",
                        "<strong>Support:</strong> Ask the document owner for the source.",
                      ),
                    ) +
                    p(
                      t(
                        "<strong>下一步：</strong>明日上午跟进，其他工作继续推进。",
                        "<strong>Next step:</strong> Follow up tomorrow morning; other work can continue.",
                      ),
                    )
                : hint(
                    t("问题：卡在哪里？", "Blocker: what is holding you up?"),
                  ) +
                    hint(
                      t(
                        "协作：需要谁提供什么帮助？",
                        "Support: who can help, and how?",
                      ),
                    ) +
                    hint(
                      t(
                        "下一步：准备如何跟进？",
                        "Next step: how will you follow up?",
                      ),
                    ),
              "side-note",
              t("选填", "Optional"),
            ),
          "daily",
        ) +
        footer(
          t("备注", "Notes"),
          t(
            example
              ? "整理资料时补一句用途，下次更容易接着用。"
              : "临时信息或今日发现；不需要时可删除。",
            example
              ? "A short purpose makes a saved reference easier to use later."
              : "Extra context or a discovery; remove this section when not needed.",
          ),
        ),
    );
  }
  if (key === "weekly")
    return page(
      key,
      head(t("本周工作回顾", "This week in review"), date) +
        `<div class="ln-note-summary">${p(t(example ? "项目说明完成初稿，资料入口已整理。下周先确认尚未解决的问题。" : "用一两句话概括本周的收获；不需要时可删除。", example ? "The project brief and reference collection are ready. Next week, clarify the remaining questions." : "Summarize the week in a sentence or two; remove this introduction if unnecessary."))}</div>` +
        section(
          t("01 · 本周完成", "01 · Completed this week"),
          example
            ? list(
                t(
                  [
                    "项目说明形成初稿：目标与边界已明确，等待讨论定稿。",
                    "常用资料已有统一入口，补充了来源与用途。",
                  ],
                  [
                    "Drafted the project brief with goals and scope ready for review.",
                    "Collected common references and added their sources and purpose.",
                  ],
                ),
              )
            : list(
                t(
                  [
                    "事项一：做了什么，形成了什么结果？",
                    "事项二：补充成果或相关链接。",
                  ],
                  [
                    "Item 1: what did you do, and what changed?",
                    "Item 2: add an outcome or a useful link.",
                  ],
                ),
              ),
        ) +
        section(
          t("02 · 问题与思考", "02 · Questions & reflections"),
          value(
            t(
              "哪里遇到了困难？哪些做法值得保留或调整？",
              "What was difficult? What should continue or change?",
            ),
            p(
              t(
                "整理得更细不一定更好找。与其继续拆分类，不如先补上资料的用途。历史方案尚未补齐，需要资料负责人协助。",
                "More categories do not necessarily make things easier to find. Add a purpose first. The document owner still needs to supply the earlier proposal.",
              ),
            ),
          ),
        ) +
        section(
          t("03 · 下周计划", "03 · Next week"),
          list(
            example
              ? t(
                  [
                    "确认初稿，补齐缺失材料。",
                    "用一次实际任务检验资料是否容易找回。",
                  ],
                  [
                    "Review the draft and complete missing references.",
                    "Try finding a reference for an actual task.",
                  ],
                )
              : t(
                  ["优先事项：准备完成什么？", "需要谁协作，何时跟进？"],
                  [
                    "Priority: what do you plan to finish?",
                    "Who can help, and when will you follow up?",
                  ],
                ),
          ),
        ),
    );
  if (key === "meeting")
    return page(
      key,
      head(
        t(
          example ? "项目资料整理 · 周会" : "会议主题",
          example ? "Project references · Team meeting" : "Meeting topic",
        ),
        "{{datetime}}",
      ) +
        `<p class="ln-note-meeting-meta">${t("参会人", "Participants")}：${t(example ? "研究、设计、记录者" : "姓名 / 角色", example ? "Research, design, note-taker" : "Names / roles")}　·　${t("记录人", "Notes by")}：${t(example ? "记录者" : "姓名", example ? "Note-taker" : "Name")}</p>` +
        block(
          t("已确认决定", "Confirmed decisions"),
          value(
            t("这次会议确定了什么？", "What was agreed?"),
            list(
              t(
                [
                  "先整理现有资料，不增加新的分类层级。",
                  "由各资料负责人补齐来源，再进行一次试用。",
                ],
                [
                  "Organize existing references before adding categories.",
                  "Ask owners to add sources, then run a small trial.",
                ],
              ),
            ),
          ),
          "decision",
        ) +
        block(
          t("行动项", "Action items"),
          table(
            t(["要做什么", "负责人", "完成时间"], ["Action", "Owner", "Due"]),
            example
              ? t(
                  [
                    ["补齐历史方案与来源", "研究", "下一次讨论前"],
                    ["整理试用问题清单", "设计", "试用前"],
                    ["汇总反馈，更新项目说明", "记录者", "试用后"],
                  ],
                  [
                    [
                      "Add earlier proposals and sources",
                      "Research",
                      "Before the next meeting",
                    ],
                    ["Prepare trial questions", "Design", "Before the trial"],
                    [
                      "Summarize feedback and update the brief",
                      "Note-taker",
                      "After the trial",
                    ],
                  ],
                )
              : [
                  t(
                    ["填写具体行动", "姓名", "日期"],
                    ["A specific action", "Name", "Date"],
                  ),
                ],
          ),
          "open",
        ) +
        block(
          t("讨论记录", "Discussion"),
          value(
            t(
              "按议题记下重要理由，不必逐字记录。",
              "Keep the important reasoning for each topic.",
            ),
            `<h3>${t("资料应该如何分类？", "How should references be organized?")}</h3>${p(t("先按项目归拢。暂时无法确定用途的内容保留在待整理，避免为了归档而反复改分类。", "Group references by project. Keep items with an unclear purpose in the inbox until their use becomes clear."))}`,
          ),
          "open",
        ) +
        footer(
          t("待确认", "Open question"),
          t(
            example
              ? "是否需要单独保留历史版本，下次结合试用反馈再决定。"
              : "留下尚未达成一致的问题。",
            example
              ? "Decide how to retain older versions after reviewing trial feedback."
              : "Keep questions that are still unresolved.",
          ),
        ),
    );
  if (key === "reading")
    return page(
      key,
      head(
        t(
          example ? "让笔记成为下一次思考的起点" : "书名 / 文章标题",
          example
            ? "A starting point for your next thought"
            : "Book / article title",
        ),
        date,
        t(
          example ? "阅读练习 · 示例短文" : "作者 · 阅读章节 / 来源",
          example
            ? "Reading practice · Example passage"
            : "Author · Chapter / source",
        ),
      ) +
        `<p class="ln-note-reading-intro">${t(example ? "不必把读过的内容全部搬进笔记。留下一句触动自己的话，再补上它和生活的联系，就有了下次继续思考的入口。" : "这次最想记住的一点……", example ? "Keep a passage that matters to you, then connect it to your own experience. It gives you somewhere to begin next time." : "The one thing you want to remember…")}</p>` +
        section(
          t("值得留下的摘录", "A passage to keep"),
          `<blockquote>${p(t(example ? "一份有用的记录，会让未来的自己更容易继续。" : "放入原文摘录。", example ? "A useful record helps your future self pick up where you left off." : "Add the original passage."))}<p class="ln-note-citation">${t(example ? "虚构示例短文，用于演示引用排版" : "页码 / 章节 / 原文链接", example ? "Fictional passage for this formatting example" : "Page / chapter / source link")}</p></blockquote>`,
        ) +
        section(
          t("我的想法", "My thoughts"),
          value(
            t(
              "为什么记住它？可以联系自己的经历，也可以写不同意见。",
              "Why keep it? Connect it to your experience or question it.",
            ),
            p(
              t(
                "以前我常常只保存链接。隔了一段时间，虽然还能找到文章，却忘了当时为什么觉得它有用。",
                "I used to save only the link. Later, I could find the article but had forgotten why it mattered.",
              ),
            ) +
              p(
                t(
                  "现在试着在收藏后补一句用途：<mark>准备在哪件事上用到它？</mark>不需要长篇总结，一两句话也有价值。",
                  "Now I add a purpose: <mark>What might I use this for?</mark> One or two sentences can be enough.",
                ),
              ),
          ),
        ) +
        section(
          t("想试一试", "Something to try"),
          value(
            t(
              "选一个小行动，或留下一个还想追问的问题。",
              "Choose a small action or a question to explore.",
            ),
            p(
              t(
                "从最近的一条收藏开始，补上一句用途说明。还想追问：哪些资料只保留入口就足够？",
                "Add a purpose to one recent bookmark. A question to keep: when is saving the link enough?",
              ),
            ),
          ),
        ) +
        footer(
          t("相关笔记", "Related notes"),
          t(
            example ? "Markdown 语法速查表" : "添加一篇相关笔记或原文链接",
            example
              ? "Markdown quick reference"
              : "Add a related note or the original source",
          ),
        ),
    );
  if (key === "project")
    return page(
      key,
      head(
        t(
          example ? "把团队资料整理到一个地方" : "项目名称",
          example ? "Bring project references together" : "Project name",
        ),
        t("负责人 · 姓名", "Owner · Name"),
      ) +
        block(
          t("要达成什么", "The goal"),
          value(
            t(
              "希望解决什么问题？做到什么算完成？",
              "What problem will this solve? What does done look like?",
            ),
            p(
              t(
                "让大家能从一个入口找到常用资料。先整理一个项目，确认能用，再逐步扩展。",
                "Make common references easy to find from one place. Start with one project and expand after trying it.",
              ),
            ),
          ),
          "focus",
        ) +
        `<div class="ln-note-scope"><div><h3>${t("这次做", "In scope")}</h3>${p(t(example ? "常用文档、参考链接和会议记录" : "写清范围", example ? "Common documents, links and meeting notes" : "Describe the scope"))}</div><div><h3>${t("暂时不做", "Not yet")}</h3>${p(t(example ? "历史资料全量搬迁、复杂分类" : "写清边界", example ? "Moving all historical files or creating complex categories" : "Describe the boundary"))}</div></div>` +
        section(
          t("阶段安排", "Milestones"),
          (example
            ? t(
                [
                  [
                    "01 · 盘点 · 第 1 周",
                    "列出缺失资料，确认每项来源，形成资料清单。",
                  ],
                  ["02 · 整理 · 第 2 周", "建立统一入口，产出资料包初稿。"],
                  ["03 · 交接 · 第 2 周", "请接手人独立查找，按反馈补充说明。"],
                ],
                [
                  [
                    "01 · Inventory · Week 1",
                    "List missing references and confirm sources.",
                  ],
                  [
                    "02 · Organize · Week 2",
                    "Create a shared starting point and a draft reference pack.",
                  ],
                  [
                    "03 · Handoff · Week 2",
                    "Ask a colleague to find references independently and improve the instructions.",
                  ],
                ],
              )
            : t(
                [
                  ["01 · 第一阶段 · 日期", "填写可检查的交付物。"],
                  ["02 · 第二阶段 · 日期", "填写交付物与验收方式。"],
                ],
                [
                  [
                    "01 · First stage · Date",
                    "Name an observable deliverable.",
                  ],
                  [
                    "02 · Second stage · Date",
                    "Describe the deliverable and how to check it.",
                  ],
                ],
              )
          )
            .map(
              ([title, detail]) =>
                `<div class="ln-note-milestone"><h3>${title}</h3>${p(detail)}</div>`,
            )
            .join(""),
        ) +
        footer(
          t("依赖与风险", "Dependencies & risks"),
          t(
            example
              ? "历史材料不完整时标注缺口，保留原件；不要假定已经补齐。"
              : "需要哪些支持？有哪些尚未确认的条件？",
            example
              ? "Mark missing historical references and keep the originals; do not assume the gaps are filled."
              : "What support is needed? Which conditions remain unconfirmed?",
          ),
        ),
    );
  if (key === "review")
    return page(
      key,
      head(
        t(
          example ? "一次交接之后" : "复盘事项",
          example ? "After a handoff" : "Topic to review",
        ),
        date,
      ) +
        [
          [
            t("原本预期", "Expected"),
            t(
              example ? "同事可以直接找到三份常用文档。" : "最初希望发生什么？",
              example
                ? "A colleague could find three common documents independently."
                : "What did you expect?",
            ),
          ],
          [
            t("实际发生", "Observed"),
            t(
              example
                ? "两份很快找到；另一份叫“最终版”，需要额外询问。"
                : "记录可以核对的事实，区分观察与判断。",
              example
                ? "Two were easy to find. The one named “final” required clarification."
                : "Record verifiable facts and separate observations from judgments.",
            ),
          ],
          [
            t("原因分析", "Analysis"),
            t(
              example
                ? "目录解决了入口问题，名称却没有表达用途。尚不能确认换名后是否对所有人都有帮助。"
                : "哪些因素造成差异？哪些解释仍需验证？",
              example
                ? "The collection solved access, but the name did not express purpose. Whether renaming helps everyone is still unconfirmed."
                : "What caused the difference? Which explanations need checking?",
            ),
          ],
          [
            t("下次改变", "Next attempt"),
            t(
              example
                ? "在文件名中加入用途。下次交接前请同事再找一次，观察是否仍需询问。"
                : "尝试一个具体改变：谁来做、何时做、怎样判断是否有效？",
              example
                ? "Add the purpose to the file name. Before the next handoff, ask a colleague to find it and observe whether they still need help."
                : "Try one concrete change: who, when, and how will you judge the result?",
            ),
          ],
        ]
          .map(
            ([title, body]) =>
              `<div class="ln-note-cause"><h2>${title}</h2><div>${p(body)}</div></div>`,
          )
          .join(""),
    );
  throw new Error("UNKNOWN_BUILTIN_NOTE_TEMPLATE");
}

function renderMarkdown(key, locale, example) {
  const zh = locale === "zh-CN";
  if (key === "knowledge")
    return zh
      ? `> 记录于 {{date}}

## 问题与回答

${example ? "**为什么文件名也值得认真写？**" : "写下一个明确的问题，再用自己的话回答。"}

${example ? "文件名既是名称，也是找回时的线索。" : "用自己的话解释这个概念。"}

## 关键要点

${example ? "1. 让人看出是什么内容。\n2. 保留需要区分的日期或版本。\n3. 避免只有“最终版”“新建文档”。" : "保留最重要的两三点。"}

## 一个例子

${example ? "\`项目说明_资料整理.md\`" : "举一个能说明问题的例子。"}

## 适用边界

${example ? "临时草稿可以简单命名。需要共享、长期保存或存在多个版本时，再补全信息。" : "什么时候不适用？还有什么没想清楚？"}

## 相关笔记

${example ? "资料整理与会议记录。" : "添加来源或关联笔记。"}
`
      : `> Recorded on {{date}}

## Question & answer

${example ? "**Why does a file name matter?**" : "Write one specific question, then answer it in your own words."}

${example ? "A file name is also a clue for finding it later." : "Explain the concept in your own words."}

## Key points

${example ? "1. Make the content recognizable.\n2. Include dates or versions when needed.\n3. Avoid names such as “final” or “new document”." : "Keep the two or three most important points."}

## An example

${example ? "\`project-brief-reference-collection.md\`" : "Add an example that makes the idea clear."}

## Limits

${example ? "Temporary drafts can have simple names. Add more detail when sharing, archiving or keeping multiple versions." : "When does it not apply? What is still unclear?"}

## Related notes

${example ? "Reference collection and meeting notes." : "Add a source or related note."}
`;
  const code = example
    ? zh
      ? "mindmap\n  root(周末出行)\n    去哪里\n      公园\n      展览\n    带什么\n      水\n      相机\n    怎么安排\n      交通\n      时间"
      : "mindmap\n  root(Weekend outing)\n    Where\n      Park\n      Exhibition\n    What to bring\n      Water\n      Camera\n    Planning\n      Transport\n      Time"
    : zh
      ? "mindmap\n  root(中心主题)\n    分支一\n      要点 A\n    分支二\n      要点 B\n    分支三"
      : "mindmap\n  root(Central topic)\n    Branch 1\n      Point A\n    Branch 2\n      Point B\n    Branch 3";
  return `${zh ? "> 整理于" : "> Organized on"} {{date}}

## ${zh ? "主题脑图" : "Topic map"}

\`\`\`mermaid
${code}
\`\`\`

## ${zh ? "补充说明" : "Additional details"}

${zh ? (example ? "优先选择公共交通能到的地方。出发前看天气，再确定室内还是户外。" : "按需要展开分支，不必把图里的文字再抄一遍。") : example ? "Choose somewhere accessible by public transport. Check the weather before deciding on an indoor or outdoor activity." : "Expand the branches as needed, without repeating everything in the map."}

## ${zh ? "下一步" : "Next step"}

${zh ? (example ? "确认展览开放时间，保存地址与交通路线。" : "从图中选一个需要确认的事项。") : example ? "Check opening hours and save the address and route." : "Choose one detail from the map to confirm."}
`;
}

export const BUILTIN_NOTE_BODIES = Object.fromEntries(
  [
    "daily",
    "weekly",
    "meeting",
    "reading",
    "project",
    "review",
    "knowledge",
    "mindmap",
  ].map((key) => {
    const render = ["knowledge", "mindmap"].includes(key)
      ? renderMarkdown
      : renderHtml;
    return [
      key,
      {
        content: Object.fromEntries(
          ["zh-CN", "en-US"].map((locale) => [
            locale,
            render(key, locale, false),
          ]),
        ),
        exampleContent: Object.fromEntries(
          ["zh-CN", "en-US"].map((locale) => [
            locale,
            render(key, locale, true),
          ]),
        ),
      },
    ];
  }),
);
