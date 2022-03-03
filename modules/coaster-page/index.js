/* eslint-disable quote-props */
module.exports = {
  extend: '@apostrophecms/piece-page-type',
  options: {
    label: 'Coaster page',
    perPage: 10
  },
  handlers(self) {
    return {
      serveQuery: {
        async sortByOpened(req, query) {
          console.log('serveByQuery!');
          console.log(req, query);
        }
      }
    };
  }
};
