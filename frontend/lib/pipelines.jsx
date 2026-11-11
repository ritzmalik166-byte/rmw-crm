export const PIPELINES = {
  all: {
    key: 'all', apiPipeline: 'general', title: 'All Leads', short: 'All', description: 'All business enquiries across MPF, RMW and CT. Career applications are under Recruitment.',
    interestLabel: 'Interest', filters: ['website', 'status', 'source', 'owner', 'campaign', 'formType', 'dates', 'quality'], showWebsite: true, showSource: true,
  },
  mpf: {
    key: 'mpf', website: 'MPF', logo: '/mpf-mark.png', title: 'MPF Leads', short: 'MPF', description: 'MyPropertyFact property enquiries with full campaign attribution.',
    interestLabel: 'Project', interestPlaceholder: 'Project / property', filters: ['status', 'source', 'owner', 'campaign', 'interest', 'formType', 'dates', 'quality'], showSource: true,
  },
  rmw: {
    key: 'rmw', website: 'RMW', logo: '/rmw-mark.png', title: 'RMW Leads', short: 'RMW', description: 'Ritz Media World business enquiries: contact, consulting and download forms.',
    interestLabel: 'Requirement', interestPlaceholder: 'Service / reason', filters: ['status', 'source', 'owner', 'interest', 'formType', 'dates', 'quality'], showSource: true, formTypeLabel: 'Enquiry form',
  },
  ct: {
    key: 'ct', website: 'CT', logo: '/ct-mark.png', title: 'CT Leads', short: 'CT', description: 'Contenaissance enquiries for content, campaigns and 3D websites.',
    interestLabel: 'Service', interestPlaceholder: 'Service', filters: ['status', 'source', 'owner', 'interest', 'formType', 'dates', 'quality'], showSource: true, formTypeLabel: 'Form',
  },
  career: {
    key: 'career', logo: '/rmw-mark.png', standalone: true, title: 'Career Applications', short: 'Career', description: 'Job applications received through the RMW career forms.',
    interestLabel: 'Role applied', interestPlaceholder: 'Role', filters: ['status', 'owner', 'interest', 'dates'], showWebsite: false, showSource: false, showResume: true,
  },
};

export const PIPELINE_ORDER = ['mpf', 'rmw', 'ct'];

export function PipelineLogo({ src, className = 'h-4 w-4' }) {
  return src ? <img src={src} alt="" className={`${className} shrink-0 object-contain`} /> : null;
}
