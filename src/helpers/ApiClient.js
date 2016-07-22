import superagent from 'superagent';
import { normalize } from 'normalizr';
import { isUrl } from 'utils/validation';
import { changeHttpToHttpsIfBrowserLocationIsHttps } from 'utils/transformUrl';
import config from '../config';
import { apiPath, apiPort, apiHost } from '../constants/defaults';
import Cookies from 'cookies-js';

const methods = ['get', 'post', 'put', 'patch', 'del'];

function formatUrl(path) {
  if (isUrl(path)) return path;
  const adjustedPath = path[0] !== '/' ? '/' + path : path;
  if (__SERVER__) {
    // Prepend host and port of the API server to the path.
    return 'http://localhost:' + config.apiPort + apiPath + adjustedPath;
  }
  if (process.env.APIHOST === 'localhost') {
    return 'http://localhost:' + apiPort + apiPath + adjustedPath;
  }
  return 'http://' + process.env.APIHOST + apiPath + adjustedPath;
}

function addMethodQuery(path, method) {
  if (method === 'patch') return path + '?_method=PATCH';
  if (method === 'put') return path + '?_method=PUT';
  if (method === 'del') return path + '?_method=DELETE';
  return path;
}

// Extracts the next page URL from response API response.
function getNextPageUrl(response) {
  const link = changeHttpToHttpsIfBrowserLocationIsHttps(response.next);
  if (!link) {
    return null;
  }
  delete response.next;
  return link;
}

function getPrevPageUrl(response) {
  const link = changeHttpToHttpsIfBrowserLocationIsHttps(response.previous);
  if (!link) {
    return null;
  }
  delete response.previous;
  return link;
}

/*
 * This silly underscore is here to avoid a mysterious "ReferenceError: ApiClient is not defined" error.
 * See Issue #14. https://github.com/erikras/react-redux-universal-hot-example/issues/14
 *
 * Remove it at your own risk.
 */
class _ApiClient {
  constructor(req) {
    methods.forEach((method) =>
      this[method] = (path, { params, data, schema } = {}) => new Promise((resolve, reject) => {
        const request = superagent[method](formatUrl(path));
        request.withCredentials();

        if (params) {
          request.query(params);
          if (params.language) {
            request.set({ 'Accept-Language': params.language });
          }
        }
        request.set({
          'accept': 'application/json',
          'Content-Type': 'application/json',
          //'X-Requested-With': 'XMLHttpRequest',
          //'X-HTTP-Method-Override': method
        });

        let csrftoken = null;
        if (__SERVER__ && req.get('cookie')) {
          request.set('cookie', req.get('cookie'));
          // TODO : csrf token get for Server-side Redndering
          // It's not working. Also couldn't call api server in SERVER Environment.
          csrftoken = req.get('cookie').get('csrftoken');
        }
        if (__CLIENT__) {
          csrftoken = Cookies.get('csrftoken');
        }

        if (csrftoken) {
          request.set({
            'X-CSRFToken': csrftoken,
          });
        }

        if (data) {
          request.send(data);
        }

        request.end((err, { body } = {}) => {
          if (err) {
            reject(body || err);
          } else {
            if (!body) {
              resolve(null);
            } else {
              const response = {};
              if (body.next) {
                const nextPageUrl = getNextPageUrl(body);
                Object.assign(response, { nextPageUrl });
              }
              if (body.previous) {
                const prevPageUrl = getPrevPageUrl(body);
                Object.assign(response, { prevPageUrl });
              }
              if (schema) {
                if (body.results) {
                  Object.assign(response, normalize(body.results, schema));
                } else {
                  Object.assign(response, normalize(body, schema));
                }
              } else {
                Object.assign(response, body);
              }
              resolve(response);
            }
          }
        });
      }));
  }
}

const ApiClient = _ApiClient;

export default ApiClient;
