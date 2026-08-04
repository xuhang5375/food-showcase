// 本地测试用：用 localStorage 模拟询价单，不依赖 Supabase
// 在 index.html 里，把这段 script 放在 supabase JS 之前即可生效
// 用法：浏览器打开 http://127.0.0.1:8080，功能完全可用

(function() {
  // 覆盖 supabase 全局对象，用 localStorage 模拟
  window._useLocalInquiry = true;

  function getLocalInquiries() {
    return JSON.parse(localStorage.getItem('local_inquiries') || '[]');
  }
  function saveLocalInquiries(data) {
    localStorage.setItem('local_inquiries', JSON.stringify(data));
  }

  // 模拟 supabase.from().insert().select()
  window._localSupabase = {
    from: function(table) {
      return {
        insert: function(rows) {
          return {
            select: function() {
              return {
                single: function() {
                  return new Promise(function(resolve) {
                    var data = getLocalInquiries();
                    var lastId = data.length > 0 ? data[data.length - 1].id + 1 : 1;
                    var now = new Date().toISOString();
                    if (table === 'inquiries') {
                      var row = Object.assign({}, rows[0], { id: lastId, created_at: now });
                      data.push(row);
                      saveLocalInquiries(data);
                      resolve({ data: row, error: null });
                    } else {
                      // inquiry_items
                      var items = JSON.parse(localStorage.getItem('local_inquiry_items') || '[]');
                      var itemId = items.length > 0 ? items[items.length - 1].id + 1 : 1;
                      var itemRows = rows.map(function(r, i) {
                        return Object.assign({}, r, { id: itemId + i, created_at: now });
                      });
                      items = items.concat(itemRows);
                      localStorage.setItem('local_inquiry_items', JSON.stringify(items));
                      resolve({ data: itemRows[0], error: null });
                    }
                  });
                }
              };
            }
          };
        },
        select: function() {
          return {
            order: function() {
              return {
                then: function(cb) {
                  var data = table === 'inquiries' ? getLocalInquiries() :
                    JSON.parse(localStorage.getItem('local_inquiry_items') || '[]');
                  cb({ data: data, error: null });
                  return { catch: function() {} };
                }
              };
            },
            eq: function() {
              return {
                single: function() {
                  return new Promise(function(resolve) {
                    var items = JSON.parse(localStorage.getItem('local_inquiry_items') || '[]');
                    resolve({ data: items, error: null });
                  });
                }
              };
            }
          };
        },
        update: function(obj) {
          return {
            eq: function() {
              return new Promise(function(resolve) { resolve({ error: null }); });
            }
          };
        }
      };
    }
  };

  // 在 app.js 加载后覆盖 submitInquiry 里的 supabase 调用
  window.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      if (window._useLocalInquiry) {
        console.log('[本地测试模式] 询价单将保存到 localStorage，不依赖 Supabase');
      }
    }, 500);
  });
})();
