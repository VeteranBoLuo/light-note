import tagAndBookmark from '@/assets/img/help/tag_bookmark_relation.jpg';
import tagMg from '@/assets/img/help/tag_mg.jpg';
import tagAddBtn from '@/assets/img/help/tag_addBtn.jpg';
import tagAddPage from '@/assets/img/help/tag_addPage.jpg';
import tagTable from '@/assets/img/help/tag_table.jpg';
import tagTree from '@/assets/img/help/tag_tree.jpg';
import bookmarkMg from '@/assets/img/help/bookmark_mg.jpg';
import bookmarkAddPage from '@/assets/img/help/bookmark_addPage.jpg';
import bookmarkTable from '@/assets/img/help/bookmark_table.jpg';
import bookmarkMainPage from '@/assets/img/help/bookmark_mainPage.jpg';
import opinionMg from '@/assets/img/help/opinionMg.png';
import noteManage from '@/assets/img/help/note_manage.jpg';
import cloudSpace from '@/assets/img/help/cloudSpace.jpg';
import { computed } from 'vue';
import i18n from '@/i18n';

const zhOptions = [
  {
    id: 'bookmarks-and-tags',
    title: '书签与标签',
    content: `<div class="tag-explanation" >
      <h2>理解标签与书签</h2>

        <div class="bookmark-definition">
        <h3>什么是标签？</h3>
         </div>
       <p>标签是用于描述内容、分类或属性的关键词，它帮助我们组织和分类信息。在本网站中，标签用于对书签进行分类，使得查找和浏览更加高效。</p>
     
      <div class="bookmark-definition">
        <h3>什么是书签？</h3>
        </div>
        <p>书签是保存网站链接以便快速访问的一种方式。你可以将喜欢的网页或资源添加到书签中，以便日后快速检索。</p>
     
       <div class="bookmark-definition">
      <h3>标签与书签的关系</h3>
      </div>
      <p>一个标签下可以有多个书签。例如，"文档"标签可能包含各种文档网站的书签，菜鸟教程、Vue官方网站等。</p>
      <p>同样，一个书签也可以属于多个标签。例如，Vue的官方网站可能同时属于"Vue"和"文档"这两个标签，因为它既与Vue相关，又是一个文档网站。</p>

      <div class="bookmark-definition">
        <h3>关系示例</h3>
        </div>
        <div class="flex-align-center" style="flex-direction: column">
        <img src="${tagAndBookmark}"  alt="书签示例" class="bookmark-image" style="width: 80%"  />
         <p style="font-size: 12px">
        <i>书签标签关系图</i>
    </p>
      </div>
    </div>`,
  },
  {
    id: 'tag-management',
    title: '标签管理',
    content: `<div class="flex-justify-center">
 <div style="width: 80%; height: 100%">
      <div class="bookmark-example">
        <p style="font-size: 12px">
        <p style="text-align: left">1、点击标签管理进入标签管理页面</p>
        <img src="${tagMg}"  alt="标签示例" class="bookmark-image" width="80%"  style="border: 1px solid;"/>
         <p style="text-align: left">2、点击顶部新增标签或者表格新增按钮进入添加标签页面</p>
        <img src="${tagAddBtn}"  alt="标签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
         <p style="text-align: left">3、标签图标可通过本地上传或粘贴图标的svg代码、base64代码等方式设置</p>
        <img src="${tagAddPage}"  alt="标签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
         <p style="text-align: left">4、新增成功后可在标签管理页面和首页查看</p>
        <img src="${tagTable}"  alt="标签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
         <img src="${tagTree}"  alt="标签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
          <p style="text-align: left;font-size: 12px">注：标签列表可通过拖拽排序</p>
    </p>
      </div>
      </div>
    </div>`,
  },
  {
    id: 'bookmark-management',
    title: '书签管理',
    content: `<div class="flex-justify-center" >
 <div style="width: 80%; height: 100%">
         <div class="bookmark-example">
        <p style="font-size: 12px">
         <p style="text-align: left">1、点击书签管理进入书签管理页面，或者直接右键标签快速创建与此标签相关的书签</p>
        <img src="${bookmarkMg}"  alt="书签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
          <p style="text-align: left">2、书签无需上传图标，系统会自动根据网站地址生成</p>
        <img src="${bookmarkAddPage}"  alt="书签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
          <p style="text-align: left">3、新增成功后可在书签管理页面和首页查看</p>
        <img src="${bookmarkTable}"  alt="书签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
        <img src="${bookmarkMainPage}"  alt="书签示例" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
        <p style="text-align: left;font-size: 12px">注：书签卡片可通过拖拽排序</p>
    </p>
        </div>
    </div>`,
  },
  {
    id: 'feedback',
    title: '意见反馈',
    content: `<div class="flex-justify-center" >
 <div style="width: 80%; height: 100%">
       <div class="bookmark-example">
        <img  src="${opinionMg}" alt="标签管理示例" class="bookmark-image"  >
        <p style="font-size: 12px">
    </p>
      </div>
    <div>模块宗旨</div><p style="font-size: 14px">意见反馈模块旨在搭建一个用户与项目开发人员之间沟通的桥梁，便于您及时向我反映在使用过程中遇到的问题、提出的建议以及期望的功能，帮助我不断优化产品，为您提供更优质的服务。</p>
  <br/>
  <div>模块功能</div>
  <p style="font-size: 14px">问题反馈：您可以在此提交在使用项目过程中遇到的问题，如功能异常、操作不便等，我将尽快为您解决。<br/>
  建议征集：欢迎您提出宝贵建议，包括功能优化、界面美化、操作简化等方面，我会认真倾听并积极采纳。<br/>
  点赞与鼓励：如果您对我的项目表示满意，也可以在此给予我肯定和鼓励，激励我继续努力。<br/>
  实时跟进：提交反馈后，您可以实时查看反馈处理进度，了解解决结果。</p>

  <br/>

  <div>使用指南</div>
  <p style="font-size: 14px">进入意见反馈模块：项目右上角头像下拉框中找到“意见反馈”入口，点击进入。
  填写反馈内容：根据提示，详细描述您遇到的问题或建议，以便我更快地为您解决问题。<br/>
  提交反馈：确认无误后，点击“提交”按钮，您的反馈将实时发送至项目团队。<br/>
  查看反馈进度：在“我的反馈”页面，您可以查看已提交反馈的处理进度及回复。</>

  <br/>

  <div>温馨提示</div>
  <p style="font-size: 14px">请确保反馈内容真实、客观、具体，以便我更好地为您解决问题。
  为保护您的隐私，请勿在反馈内容中透露个人信息。
  我会尽快处理您的反馈，请您耐心等待。</p>
  <br/>
  <b style="font-size: 20px">感谢您对项目的支持与关注，您的意见是我不断进步的动力！对于有效反馈，我也将会给予您应得的🧧感谢！</b></div>
    </div>`,
  },
  {
    id: 'note-management',
    title: '笔记管理',
    content: `<div class="flex-justify-center">
    <div style="width: 80%; height: 100%">
      <img src="${noteManage}" alt="笔记管理示例" class="bookmark-image"  />
      <p style="text-align: left;font-size: 14px">1、点击此处可根据标签对笔记进行过滤</p>
      <p style="text-align: left;font-size: 14px">2、鼠标悬浮在笔记卡片上时可以勾选笔记，可以对笔记进行批量删除</p>
      <p style="text-align: left;font-size: 14px">3、笔记库标题也可以点击，点击后获取最新的全部笔记</p>
    </div>
  </div>`,
  },
  {
    id: 'cloud-space',
    title: '云空间',
    content: `<div class="flex-justify-center">
    <div style="width: 80%; height: 100%">
      <img src="${cloudSpace}" alt="云空间示例" class="bookmark-image"  />
      <p style="text-align: left;font-size: 14px">1、支持用户上传文件至云端空间，实现跨设备数据存储与访，兼容移动端与桌面端操作体验，同时完善权限控制逻辑，确保用户仅能访问自身上传的文件资源</p>
      <p style="text-align: left;font-size: 14px">2、引入用户配额管理机制，每位用户暂时默认可使用最大 100MB 存储空间，并提供空间使用状态展示组件</p>
      <p style="text-align: left;font-size: 14px">3、支持按文件类型和文件夹两个维度管理文件</p>
      <p style="text-align: left;font-size: 14px">4、支持文件的上传、下载、预览、删除、重命名、搜索和分享功能</p>
    </div>
  </div>`,
  },
  {
    id: 'github-login',
    title: 'github快捷登录',
    content: `<div class="flex-justify-center">
    <div style="width: 80%; height: 100%">
      <p style="text-align: left;font-size: 14px">已经注册过轻笺账号的情况下，如果github快捷登录想要和已注册的轻笺账户关联，则github的绑定邮箱需要和轻笺的注册邮箱一致</p>
    </div>
  </div>`,
  },
];

const enOptions = [
  {
    id: 'bookmarks-and-tags',
    title: 'Bookmarks and Tags',
    content: `<div class="tag-explanation" >
      <h2>Understanding Tags and Bookmarks</h2>

        <div class="bookmark-definition">
        <h3>What are Tags?</h3>
         </div>
       <p>Tags are keywords used to describe content, categories, or attributes. They help us organize and classify information. On this website, tags are used to categorize bookmarks, making searching and browsing more efficient.</p>
     
      <div class="bookmark-definition">
        <h3>What are Bookmarks?</h3>
        </div>
        <p>Bookmarks are a way to save website links for quick access. You can add your favorite web pages or resources to bookmarks for quick retrieval later.</p>
     
       <div class="bookmark-definition">
      <h3>The Relationship Between Tags and Bookmarks</h3>
      </div>
      <p>A single tag can contain multiple bookmarks. For example, a "Documentation" tag might include bookmarks for various documentation websites, such as Runoob Tutorial and Vue Official Website.</p>
      <p>Similarly, a bookmark can belong to multiple tags. For instance, the Vue official website might simultaneously belong to both the "Vue" and "Documentation" tags because it relates to Vue and is also a documentation site.</p>

      <div class="bookmark-definition">
        <h3>Relationship Example</h3>
        </div>
        <div class="flex-align-center" style="flex-direction: column">
        <img src="${tagAndBookmark}"  alt="Bookmark Example" class="bookmark-image" style="width: 80%"  />
         <p style="font-size: 12px">
        <i>Bookmark-Tag Relationship Diagram</i>
    </p>
      </div>
    </div>`,
  },
  {
    id: 'tag-management',
    title: 'Tag Management',
    content: `<div class="flex-justify-center">
 <div style="width: 80%; height: 100%">
      <div class="bookmark-example">
        <p style="font-size: 12px">
        <p style="text-align: left">1. Click on Tag Management to enter the tag management page</p>
        <img src="${tagMg}"  alt="Tag Example" class="bookmark-image" width="80%"  style="border: 1px solid;"/>
         <p style="text-align: left">2. Click the Add Tag button at the top or the table's Add button to enter the add tag page</p>
        <img src="${tagAddBtn}"  alt="Tag Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
         <p style="text-align: left">3. Tag icons can be set by uploading locally or pasting SVG code or base64 code of the icon</p>
        <img src="${tagAddPage}"  alt="Tag Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
         <p style="text-align: left">4. After successful addition, you can view it on the tag management page and homepage</p>
        <img src="${tagTable}"  alt="Tag Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
         <img src="${tagTree}"  alt="Tag Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
          <p style="text-align: left;font-size: 12px">Note: Tag lists can be sorted by dragging</p>
    </p>
      </div>
      </div>
    </div>`,
  },
  {
    id: 'bookmark-management',
    title: 'Bookmark Management',
    content: `<div class="flex-justify-center" >
 <div style="width: 80%; height: 100%">
         <div class="bookmark-example">
        <p style="font-size: 12px">
         <p style="text-align: left">1. Click on Bookmark Management to enter the bookmark management page, or right-click on a tag to quickly create a bookmark related to that tag</p>
        <img src="${bookmarkMg}"  alt="Bookmark Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
          <p style="text-align: left">2. Bookmarks don't need to upload icons, the system will automatically generate them based on the website address</p>
        <img src="${bookmarkAddPage}"  alt="Bookmark Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
          <p style="text-align: left">3. After successful addition, you can view it on the bookmark management page and homepage</p>
        <img src="${bookmarkTable}"  alt="Bookmark Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
        <img src="${bookmarkMainPage}"  alt="Bookmark Example" class="bookmark-image"   width="80%" style="border: 1px solid;"/>
        <p style="text-align: left;font-size: 12px">Note: Bookmark cards can be sorted by dragging</p>
    </p>
        </div>
    </div>`,
  },
  {
    id: 'feedback',
    title: 'Feedback',
    content: `<div class="flex-justify-center" >
 <div style="width: 80%; height: 100%">
       <div class="bookmark-example">
        <img  src="${opinionMg}" alt="Tag Management Example" class="bookmark-image"  >
        <p style="font-size: 12px">
    </p>
      </div>
    <div>Module Purpose</div><p style="font-size: 14px">The feedback module aims to build a communication bridge between users and project developers, allowing you to promptly report issues encountered during use, make suggestions, and propose desired features. This helps me continuously optimize the product and provide you with better services.</p>
  <br/>
  <div>Module Functions</div>
  <p style="font-size: 14px">Problem Feedback: You can submit problems encountered while using the project here, such as functional abnormalities or inconvenient operations, and I will resolve them as soon as possible.<br/>
  Suggestion Collection: You're welcome to offer valuable suggestions, including feature optimization, interface beautification, and operation simplification. I will listen carefully and actively adopt them.<br/>
  Praise and Encouragement: If you're satisfied with my project, you can also give me affirmation and encouragement here to motivate me to continue working hard.<br/>
  Real-time Tracking: After submitting feedback, you can view the processing progress and results in real-time.</p>

  <br/>

  <div>Usage Guide</div>
  <p style="font-size: 14px">Enter the Feedback Module: Find the "Feedback" entry in the avatar dropdown menu at the top right of the project and click to enter.
  Fill in Feedback Content: According to the prompts, describe the problem or suggestion you encountered in detail so I can solve it faster for you.<br/>
  Submit Feedback: After confirming there are no errors, click the "Submit" button to send your feedback to the project team in real-time.<br/>
  View Feedback Progress: On the "My Feedback" page, you can view the processing progress and replies to submitted feedback.</p>

  <br/>

  <div>Warm Tips</div>
  <p style="font-size: 14px">Please ensure that the feedback content is authentic, objective, and specific so I can better solve problems for you.
  To protect your privacy, please do not disclose personal information in the feedback content.
  I will process your feedback as soon as possible, please wait patiently.</p>
  <br/>
  <b style="font-size: 20px">Thank you for your support and attention to the project. Your opinions are the driving force behind my continuous improvement! For effective feedback, I will also give you deserved 🧧 thanks!</b></div>
    </div>`,
  },
  {
    id: 'note-management',
    title: 'Note Management',
    content: `<div class="flex-justify-center">
    <div style="width: 80%; height: 100%">
      <img src="${noteManage}" alt="Note Management Example" class="bookmark-image"  />
      <p style="text-align: left;font-size: 14px">1. Click here to filter notes by tags</p>
      <p style="text-align: left;font-size: 14px">2. When hovering over note cards with the mouse, you can select notes for batch deletion</p>
      <p style="text-align: left;font-size: 14px">3. The note library title can also be clicked to get the latest complete set of notes</p>
    </div>
  </div>`,
  },
  {
    id: 'cloud-space',
    title: 'Cloud Space',
    content: `<div class="flex-justify-center">
    <div style="width: 80%; height: 100%">
      <img src="${cloudSpace}" alt="Cloud Space Example" class="bookmark-image"  />
      <p style="text-align: left;font-size: 14px">1. Supports users uploading files to cloud space, enabling cross-device data storage and access, compatible with mobile and desktop experiences, while improving permission control logic to ensure users can only access their own uploaded file resources</p>
      <p style="text-align: left;font-size: 14px">2. Introduces user quota management mechanism, each user temporarily defaults to maximum 100MB storage space, and provides space usage status display components</p>
      <p style="text-align: left;font-size: 14px">3. Supports managing files by two dimensions: file type and folder</p>
      <p style="text-align: left;font-size: 14px">4. Supports file upload, download, preview, delete, rename, search, and share functions</p>
    </div>
  </div>`,
  },
  {
    id: 'github-login',
    title: 'GitHub Quick Login',
    content: `<div class="flex-justify-center">
    <div style="width: 80%; height: 100%">
      <p style="text-align: left;font-size: 14px">If you have already registered a Light Note account and want to associate GitHub quick login with your existing Light Note account, the GitHub binding email must match the Light Note registration email</p>
    </div>
  </div>`,
  },
];

export const listOptions = computed(() => {
  return i18n.global.locale.value === 'zh-CN' ? zhOptions : enOptions;
});
