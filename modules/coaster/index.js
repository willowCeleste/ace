/* eslint-disable prefer-const */
const axios = require('axios');
const cheerio = require('cheerio');
const urlParser = require('url');
const slugify = require('slugify');

const convertDateToAnniversary = date => {
  let split = date.split('-');
  split.shift();
  return split.join('');
};

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    label: 'Coaster',
    csrfExceptions: [ '/api/v1/coaster/upload-csv' ],
    sort: {
      title: 1
    }
  },
  fields: {
    add: {
      dateOpened: {
        type: 'date',
        label: 'Opened'
      },
      incompleteOpenedDate: {
        type: 'string',
        label: 'Incomplete Opened Date'
      },
      park: {
        type: 'string',
        label: 'Park'
      },
      rcdbUrl: {
        type: 'url',
        label: 'RCDB URL'
      },
      dateAsInt: {
        type: 'string',
        label: 'Day and Month',
        readOnly: true
      }
    },
    group: {
      basics: {
        label: 'Basics',
        fields: [ 'title', 'dateOpened', 'incompleteOpenedDate', 'park', 'rcdbUrl' ]
      }
    }
  },
  // batchOperations: {
  //   add: {
  //     rcdbSync: {
  //       label: 'Sync',
  //       icon: 'sync',
  //       messages: {
  //         progress: 'Syncing {{ type }} from RCDB',
  //         completed: 'Synced {{ count }} {{ type }}'
  //       },
  //       if: {
  //         archived: false
  //       },
  //       modalOptions: {
  //         title: 'Synced {{ type }}',
  //         description: 'Are you sure you want to sync {{ count }} {{ type }}?',
  //         confirmationButton: 'Yes, sync the selected content'
  //       }
  //     }
  //   }
  // },
  // icons: {
  //   sync: 'AirHorn'
  // },
  handlers(self, options) {
    return {
      beforeSave: {
        async convertDateInt(req, doc, options) {
          if (doc.dateOpened) {
            let split = doc.dateOpened.split('-');
            split.shift();
            doc.dateAsInt = split.join('');
          }
        }
      }
    };
  },
  components(self) {
    return {
      async upcomingOpeningDates(req, data) {
        const today = new Date().toISOString().split('T')[0];
        let dayAndMonthSplit = today.split('-');
        dayAndMonthSplit.shift();
        const dayAndMonth = dayAndMonthSplit.join('');
        console.log(dayAndMonth);
        const criteria = {
          dateAsInt: {
            $exists: true,
            $gt: dayAndMonth
          }
        };
        const upcoming = await self.find(req, criteria).sort({ dateAsInt: 1 }).limit(10).toArray();
        return {
          upcoming
        };
      },
      async todaysAnniversaries(req, data) {
        const todayString = new Date().toISOString().split('T')[0];
        console.log(todayString);
        try {
          const todays = await self.find(req, { dateAsInt: convertDateToAnniversary(todayString) }).limit(5).toArray();
          return {
            todays
          };
        } catch (e) {
          console.log(e);
        }
      }
    };
  },
  apiRoutes(self) {
    return {
      post: {
        async uploadCsv(req, res) {
          const url = 'https://rcdb.com/r.htm?ex=on&ol=59&ot=2'; // temp
          const page = await axios.get(url);
          const $ = cheerio.load(page.data);
          // eslint-disable-next-line node/no-deprecated-api
          const query = urlParser.parse(url, true).query;
          console.log(query);
          const existing = !!(query.ex && query.ex === 'on');

          const topTable = $('.t-list.t-top');
          const tBodyTop = topTable.find('tbody');
          const splitPages = tBodyTop.find('tr:nth-child(2)').text().split(' ');
          const totalPages = splitPages[splitPages.length - 1].replace(')', '');

          let urls = [];

          if (splitPages.length === 1) {
            urls.push(url);
          } else {
            const nums = [ ...Array(parseInt(totalPages)).keys() ];
            if (nums && nums.length) {
              for (const i of nums) {
                const status = existing ? 'ex' : 'df';
                const url = 'https://rcdb.com' + `/r.htm?page=${i + 1}&ot=${query.ot}&ol=${query.ol}&${status}`;
                urls.push(url);
              };
            }
          }

          try {
            const pagesData = await axios.all(urls.map(url => {
              return axios.get(url);
            }));
            const coasterData = [];
            for (const item of pagesData) {
              const $ = cheerio.load(item.data);
              const dataTable = $('.stdtbl.rer table');
              const rows = dataTable.find('tbody tr');

              for await (const el of rows) {
                const opened = $(el).find('td:nth-child(7)');
                let closed;
                if (!existing) {
                  closed = $(el).find('td:nth-child(8)');
                }
                const getDateFromTd = td => {
                  const dateTime = td.find('time').attr('datetime');
                  let openedDate = '';

                  if (td.find('time').length === 1) {
                    if (td.text()) {
                      if (td.text() === 's') {
                        openedDate = `${dateTime}s`;
                      } else {
                        openedDate = td.text() + dateTime;
                      }
                    } else {
                      openedDate = dateTime;
                    }
                  } else if (td.find('time').length === 2) {
                    const years = [];
                    td.find('time').each((i, el) => {
                      years.push($(el).attr('datetime'));
                    });
                    openedDate = years.join(' - ');
                  }
                  return openedDate;
                };

                let obj = {
                  coaster: $(el).find('td:nth-child(2) a').text(),
                  park: $(el).find('td:nth-child(3) a').text(),
                  opened: getDateFromTd(opened)
                };

                const parsedOpen = getDateFromTd(opened);
                const coasterTitle = $(el).find('td:nth-child(2) a').text();
                const parkTitle = $(el).find('td:nth-child(3) a').text();

                let initial = {
                  title: coasterTitle,
                  park: parkTitle,
                  dateOpened: parsedOpen.split('-').length === 3 ? parsedOpen : null,
                  incompleteOpenedDate: parsedOpen.split('-').length === 3 ? null : parsedOpen,
                  slug: slugify(`${coasterTitle} ${parkTitle}`).toLowerCase()
                };

                if (!existing) {
                  obj.closed = getDateFromTd(closed);
                }

                let newCoaster = self.newInstance();
                newCoaster = initial;

                const insertRes = await self.insert(req, initial);
                console.log(insertRes);

                coasterData.push(newCoaster);
              }
            }
            return coasterData;
          } catch (e) {
            console.log(e);
            res.send('Oh no, something went wrong!');
          }
        }
      }
    };
  }
};
