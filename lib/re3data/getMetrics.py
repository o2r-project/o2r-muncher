import urllib.request
import json

base_url = 'https://www.re3data.org/metrics/data/'
metrics = ['aidSystems',
           'apis',
           'certificates',
           'contentTypes',
           'dataAccess',
           'dataAccessRestrictions',
           'databaseAccess',
           'databaseAccessRestrictions',
           'databaseLicenses',
           'dataLicenses',
           'dataUploads',
           'dataUploadRestrictions',
           'enhancedPublication',
           'institutionCountry',
           'responsibilityTypes',
           'institutionType',
           'keywords',
           'metadataStandards',
           'pidSystems',
           'providerTypes',
           'qualityManagement',
           'repositoryLanguages',
           'software',
           'subjects',
           'syndications',
           'types',
           'versioning']

f = open('re3data-metrics.json', 'w')
f.write('{')

for metric in metrics:
    content = urllib.request.urlopen(base_url + metric)
    data = content.read();
    encoding = content.info().get_content_charset('utf-8')
    contentJson = json.loads(data.decode(encoding))
    f.write('"' + metric + '": ')

    term_list = []

    for met in contentJson:
        term_list.append(met['Terms'])

    f.write(json.dumps(term_list))
    if metric != metrics[len(metrics) - 1]:
        f.write(', \n')
    else:
        f.write('\n')

f.write('}')
