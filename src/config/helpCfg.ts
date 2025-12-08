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
import { ref } from 'vue';

export const listOptions = ref([
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
  View Feedback Progress: On the "My Feedback" page, you can view the processing progress and replies to submitted feedback.</>

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
]);