import { apiBaseGet, apiBasePost, apiQueryPost } from '@/http/request';

const opinionApi = {
  createOpinion(data) {
    return apiBasePost('/api/opinion/recordOpinion', data);
  },
  getOpinionList(data) {
    return apiQueryPost('/api/opinion/getOpinionList', data);
  },
  replyOpinion(data) {
    return apiBasePost('/api/opinion/replyOpinion', data);
  },
  markOpinionReplyViewed(data = {}) {
    return apiBasePost('/api/opinion/markOpinionReplyViewed', data);
  },
  getOpinionNotice() {
    return apiBaseGet('/api/opinion/getOpinionNotice');
  },
  deleteOpinion(data) {
    return apiBasePost('/api/opinion/delOpinion', data);
  },
};

export default opinionApi;
