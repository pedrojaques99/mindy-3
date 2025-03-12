import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getRelatedResources } from '../utils/resourceUtils';

const RelatedResources = ({ resources, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-dark-300 rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-dark-400 rounded w-3/4 mb-3"></div>
            <div className="h-3 bg-dark-400 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }
  
  if (!resources || resources.length === 0) {
    return (
      <div className="text-gray-400 p-4 text-center">
        No related resources found
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {resources.map((resource, index) => (
        <motion.div
          key={resource.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-dark-300 hover:bg-dark-400 transition-colors duration-300 rounded-lg overflow-hidden"
        >
          <Link to={`/resource/${resource.id}`} className="block p-4">
            <h3 className="text-white font-medium mb-2 line-clamp-1">{resource.title}</h3>
            {resource.description && (
              <p className="text-gray-400 text-sm line-clamp-2 mb-2">{resource.description}</p>
            )}
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-gray-500">
                {resource.category}
              </span>
              <span className="text-xs text-[#bfff58]">
                {new Date(resource.created_at).toLocaleDateString()}
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
};

export default RelatedResources; 